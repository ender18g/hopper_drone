import UIKit
import CoreBluetooth
import Capacitor

@objc(HopperNativePlugin)
public class HopperNativePlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate, URLSessionDataDelegate {
    public let identifier = "HopperNativePlugin"
    public let jsName = "HopperNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestDevice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopCamera", returnType: CAPPluginReturnPromise)
    ]

    private var central: CBCentralManager!
    private var discovered: [UUID: CBPeripheral] = [:]
    private var selectedPeripheral: CBPeripheral?
    private var namePrefixes: [String] = []
    private var scanCall: CAPPluginCall?
    private var connectCall: CAPPluginCall?
    private var pendingServiceDiscoveries = Set<CBUUID>()
    private var characteristics: [String: CBCharacteristic] = [:]
    private var readCalls: [String: CAPPluginCall] = [:]

    private var cameraSession: URLSession?
    private var cameraTask: URLSessionDataTask?
    private var cameraStartCall: CAPPluginCall?
    private var cameraBuffer = Data()
    private var lastFrameTime = Date.distantPast
    private var checkSession: URLSession?
    private var checkTaskIdentifier: Int?
    private var checkCall: CAPPluginCall?

    public override func load() {
        central = CBCentralManager(delegate: self, queue: .main)
    }

    @objc func requestDevice(_ call: CAPPluginCall) {
        guard scanCall == nil else {
            call.reject("A Bluetooth device picker is already open.")
            return
        }
        namePrefixes = call.getArray("namePrefixes", String.self) ?? []
        discovered.removeAll()
        scanCall = call
        beginScanIfReady()
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard
            let deviceId = call.getString("deviceId"),
            let uuid = UUID(uuidString: deviceId),
            let peripheral = discovered[uuid]
        else {
            call.reject("The selected Hopper is no longer available. Scan again.")
            return
        }
        guard connectCall == nil else {
            call.reject("A Hopper connection is already in progress.")
            return
        }
        selectedPeripheral = peripheral
        connectCall = call
        characteristics.removeAll()
        pendingServiceDiscoveries.removeAll()
        peripheral.delegate = self
        central.connect(peripheral)
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        if let peripheral = selectedPeripheral {
            central.cancelPeripheralConnection(peripheral)
        }
        call.resolve()
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let characteristic = characteristic(for: call) else { return }
        let key = characteristicKey(characteristic)
        guard readCalls[key] == nil else {
            call.reject("A read is already pending for this characteristic.")
            return
        }
        readCalls[key] = call
        selectedPeripheral?.readValue(for: characteristic)
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let characteristic = characteristic(for: call) else { return }
        guard
            let value = call.getString("value"),
            let data = Data(base64Encoded: value),
            let peripheral = selectedPeripheral
        else {
            call.reject("The Bluetooth command payload is invalid.")
            return
        }

        if characteristic.properties.contains(.writeWithoutResponse) {
            peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
            call.resolve()
        } else if characteristic.properties.contains(.write) {
            peripheral.writeValue(data, for: characteristic, type: .withResponse)
            // Mambo commands carry their own protocol acknowledgement. Resolve
            // after Core Bluetooth accepts the write so the 20 Hz flight loop
            // does not accumulate plugin calls.
            call.resolve()
        } else {
            call.reject("This Hopper characteristic is not writable.")
        }
    }

    @objc func startNotifications(_ call: CAPPluginCall) {
        guard let characteristic = characteristic(for: call), let peripheral = selectedPeripheral else { return }
        guard characteristic.properties.contains(.notify) || characteristic.properties.contains(.indicate) else {
            call.reject("This Hopper characteristic does not support notifications.")
            return
        }
        peripheral.setNotifyValue(true, for: characteristic)
        call.resolve()
    }

    @objc func checkCamera(_ call: CAPPluginCall) {
        guard let url = allowedCameraURL(from: call) else { return }
        checkSession?.invalidateAndCancel()
        checkCall?.reject("A newer camera check replaced this request.")

        checkCall = call
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 4
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        checkSession = session
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("multipart/x-mixed-replace,image/jpeg,image/*", forHTTPHeaderField: "Accept")
        let task = session.dataTask(with: request)
        checkTaskIdentifier = task.taskIdentifier
        task.resume()
    }

    @objc func startCamera(_ call: CAPPluginCall) {
        guard let url = allowedCameraURL(from: call) else { return }
        stopCameraStream()
        cameraStartCall = call
        cameraBuffer.removeAll(keepingCapacity: true)
        lastFrameTime = .distantPast

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = TimeInterval.greatestFiniteMagnitude
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        cameraSession = session
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("multipart/x-mixed-replace,image/jpeg,image/*", forHTTPHeaderField: "Accept")
        let task = session.dataTask(with: request)
        cameraTask = task
        task.resume()
    }

    @objc func stopCamera(_ call: CAPPluginCall) {
        stopCameraStream()
        call.resolve()
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            beginScanIfReady()
        } else if let call = scanCall, central.state != .unknown && central.state != .resetting {
            scanCall = nil
            call.reject("Bluetooth is unavailable. Turn on Bluetooth and allow access in iPad Settings.")
        }
    }

    public func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? ""
        guard namePrefixes.contains(where: { name.hasPrefix($0) }) else { return }
        discovered[peripheral.identifier] = peripheral
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices(nil)
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connectCall?.reject(error?.localizedDescription ?? "The Hopper Bluetooth connection failed.")
        connectCall = nil
        selectedPeripheral = nil
    }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        let deviceId = peripheral.identifier.uuidString
        connectCall?.reject(error?.localizedDescription ?? "The Hopper disconnected while connecting.")
        connectCall = nil
        if selectedPeripheral?.identifier == peripheral.identifier {
            selectedPeripheral = nil
            characteristics.removeAll()
            pendingServiceDiscoveries.removeAll()
        }
        notifyListeners("disconnected", data: ["deviceId": deviceId])
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            failConnection(error.localizedDescription)
            return
        }
        guard let services = peripheral.services, !services.isEmpty else {
            failConnection("The Hopper did not expose any Bluetooth services.")
            return
        }
        pendingServiceDiscoveries = Set(services.map(\.uuid))
        for service in services {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error {
            failConnection(error.localizedDescription)
            return
        }
        for characteristic in service.characteristics ?? [] {
            characteristics[characteristicKey(service.uuid, characteristic.uuid)] = characteristic
        }
        pendingServiceDiscoveries.remove(service.uuid)
        if pendingServiceDiscoveries.isEmpty, let call = connectCall {
            connectCall = nil
            call.resolve()
        }
    }

    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        let key = characteristicKey(characteristic)
        if let call = readCalls.removeValue(forKey: key) {
            if let error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve(["value": characteristic.value?.base64EncodedString() ?? ""])
            }
            return
        }
        guard error == nil, let value = characteristic.value else { return }
        notifyListeners("notification", data: [
            "deviceId": peripheral.identifier.uuidString,
            "service": characteristic.service?.uuid.uuidString.lowercased() ?? "",
            "characteristic": characteristic.uuid.uuidString.lowercased(),
            "value": value.base64EncodedString()
        ])
    }

    public func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let accepted = (200..<400).contains(status)

        if session === checkSession, dataTask.taskIdentifier == checkTaskIdentifier {
            checkCall?.resolve(["connected": accepted])
            checkCall = nil
            checkTaskIdentifier = nil
            checkSession?.finishTasksAndInvalidate()
            checkSession = nil
            completionHandler(.cancel)
            return
        }

        guard dataTask === cameraTask else {
            completionHandler(.cancel)
            return
        }
        guard accepted else {
            cameraStartCall?.reject("The Hopper camera returned HTTP \(status).")
            cameraStartCall = nil
            completionHandler(.cancel)
            return
        }
        cameraStartCall?.resolve()
        cameraStartCall = nil
        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard dataTask === cameraTask else { return }
        cameraBuffer.append(data)
        emitCompleteCameraFrames()
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if session === checkSession, task.taskIdentifier == checkTaskIdentifier {
            checkCall?.resolve(["connected": false])
            checkCall = nil
            checkTaskIdentifier = nil
            checkSession?.invalidateAndCancel()
            checkSession = nil
            return
        }
        guard task === cameraTask else { return }
        if let call = cameraStartCall {
            call.reject(error?.localizedDescription ?? "The Hopper camera connection ended.")
            cameraStartCall = nil
        } else if let error, (error as NSError).code != NSURLErrorCancelled {
            notifyListeners("cameraError", data: ["message": error.localizedDescription])
        }
    }

    private func beginScanIfReady() {
        guard scanCall != nil, central?.state == .poweredOn else { return }
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.presentDevicePicker()
        }
    }

    private func presentDevicePicker() {
        guard let call = scanCall else { return }
        central.stopScan()
        let devices = discovered.values.sorted {
            ($0.name ?? "Hopper") < ($1.name ?? "Hopper")
        }
        guard !devices.isEmpty else {
            scanCall = nil
            call.reject("No Hopper was found. Power it on, keep it nearby, and try again.")
            return
        }

        let alert = UIAlertController(
            title: "Choose a Hopper",
            message: "Select the drone to control over Bluetooth.",
            preferredStyle: .alert
        )
        for peripheral in devices {
            alert.addAction(UIAlertAction(title: peripheral.name ?? "Hopper", style: .default) { [weak self] _ in
                self?.scanCall = nil
                call.resolve([
                    "id": peripheral.identifier.uuidString,
                    "name": peripheral.name ?? "Hopper"
                ])
            })
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
            self?.scanCall = nil
            call.reject("No Hopper was selected.")
        })
        bridge?.viewController?.present(alert, animated: true)
    }

    private func characteristic(for call: CAPPluginCall) -> CBCharacteristic? {
        guard
            let deviceId = call.getString("deviceId"),
            selectedPeripheral?.identifier.uuidString == deviceId,
            let service = call.getString("service"),
            let characteristic = call.getString("characteristic")
        else {
            call.reject("The Hopper is not connected.")
            return nil
        }
        guard let result = characteristics[characteristicKey(CBUUID(string: service), CBUUID(string: characteristic))] else {
            call.reject("The Hopper firmware does not expose the requested Bluetooth characteristic.")
            return nil
        }
        return result
    }

    private func characteristicKey(_ characteristic: CBCharacteristic) -> String {
        let service = characteristic.service?.uuid.uuidString.lowercased() ?? ""
        return "\(service)|\(characteristic.uuid.uuidString.lowercased())"
    }

    private func characteristicKey(_ service: CBUUID, _ characteristic: CBUUID) -> String {
        "\(service.uuidString.lowercased())|\(characteristic.uuidString.lowercased())"
    }

    private func failConnection(_ message: String) {
        connectCall?.reject(message)
        connectCall = nil
        if let peripheral = selectedPeripheral {
            central.cancelPeripheralConnection(peripheral)
        }
    }

    private func allowedCameraURL(from call: CAPPluginCall) -> URL? {
        guard
            let rawURL = call.getString("url"),
            let components = URLComponents(string: rawURL),
            components.scheme == "http",
            components.host == "192.168.2.1",
            components.port == nil || components.port == 80,
            components.user == nil,
            components.password == nil,
            let url = components.url
        else {
            call.reject("The iPad camera bridge only allows http://192.168.2.1:80/.")
            return nil
        }
        return url
    }

    private func emitCompleteCameraFrames() {
        let startMarker = Data([0xff, 0xd8])
        let endMarker = Data([0xff, 0xd9])

        while let start = cameraBuffer.range(of: startMarker)?.lowerBound {
            guard let end = cameraBuffer.range(of: endMarker, in: start..<cameraBuffer.endIndex)?.upperBound else {
                if start > 0 { cameraBuffer.removeSubrange(0..<start) }
                break
            }
            let frame = cameraBuffer.subdata(in: start..<end)
            cameraBuffer.removeSubrange(0..<end)
            let now = Date()
            guard now.timeIntervalSince(lastFrameTime) >= 0.08 else { continue }
            lastFrameTime = now
            notifyListeners("cameraFrame", data: ["value": frame.base64EncodedString()])
        }

        if cameraBuffer.count > 4_000_000 {
            cameraBuffer.removeSubrange(0..<(cameraBuffer.count - 1_000_000))
        }
    }

    private func stopCameraStream() {
        cameraTask?.cancel()
        cameraTask = nil
        cameraSession?.invalidateAndCancel()
        cameraSession = nil
        cameraStartCall?.reject("The camera connection was cancelled.")
        cameraStartCall = nil
        cameraBuffer.removeAll(keepingCapacity: false)
    }
}

final class HopperBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HopperNativePlugin())
    }
}
