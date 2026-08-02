# Host Hopper Studio on a Raspberry Pi

This setup runs the current `main` branch of
`https://github.com/ender18g/hopper_drone` in Docker, serves it on port 80,
and restarts it after a reboot unless it was deliberately stopped.

## Before you begin

Use a Raspberry Pi 4 or 5 with at least 4 GB RAM and a 64-bit Raspberry Pi OS
image. The first Docker build compiles the complete site and can take several
minutes. The Pi needs Internet access for the initial installation and build.

There are two important networking details:

- RaspAP normally uses port 80 for its administration page. The steps below
  move that page to port 8080 so Hopper Studio can use port 80.
- One Wi-Fi radio cannot reliably be both a client and an access point on every
  Pi/driver combination. The most reliable classroom setup is the Pi's onboard
  Wi-Fi for `drone_site` plus a small USB Wi-Fi adapter for `fidoh`. RaspAP's
  one-radio AP-STA mode is experimental.

## 1. Flash Raspberry Pi OS

1. Open Raspberry Pi Imager.
2. Choose **Raspberry Pi OS Lite (64-bit)**.
3. In OS Customisation:
   - set a hostname, for example `drone-site`;
   - create an administrator username and a strong password;
   - enable SSH, preferably with a public key;
   - enter the Wi-Fi SSID and password for the home network that will be used
     for the initial setup;
   - set the correct Wi-Fi country and time zone.
4. Write the image, insert the card, and boot the Pi.
5. Find the Pi in the router's client list or try:

   ```bash
   ssh YOUR_USER@drone-site.local
   ```

Update the fresh installation:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

Reconnect over SSH after the reboot.

## 2. Install Docker

The requested one-line Docker installer is:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Allow the current user to run Docker, then reconnect so the new group takes
effect:

```bash
sudo usermod -aG docker "$USER"
exit
```

SSH back into the Pi and check the installation:

```bash
docker version
docker compose version
```

Docker's convenience script is convenient for a dedicated classroom appliance,
but Docker recommends its apt repository for production systems. Do not rerun
the script to upgrade; use `sudo apt update && sudo apt upgrade`.

## 3. Download and start Hopper Studio

The Compose file builds directly from the GitHub `main` branch, so the Pi does
not need a Git checkout:

```bash
mkdir -p ~/hopper-site
cd ~/hopper-site
curl -fsSLO https://raw.githubusercontent.com/ender18g/hopper_drone/main/pi_files/compose.yaml
docker compose up -d --build
```

Watch startup:

```bash
docker compose logs -f hopper-site
```

Press `Ctrl+C` to leave the logs; the container keeps running. Verify it before
installing RaspAP:

```bash
curl -I http://localhost/
docker compose ps
```

`restart: unless-stopped` makes Docker start the site automatically after every
reboot.

To rebuild from the newest GitHub `main` branch later:

```bash
cd ~/hopper-site
docker compose build --pull --no-cache
docker compose up -d
```

The no-cache build is intentional: it forces Docker to fetch and compile the
current Git revision instead of reusing an older remote-context layer.

## 4. Install and configure RaspAP

Install RaspAP with its quick installer:

```bash
curl -sL https://install.raspap.com | bash
```

Accept the installer defaults and reboot when requested. During configuration,
do not enable RaspAP's optional Docker container because Hopper Studio already
uses Docker and RaspAP needs to control the host network.

RaspAP's web server now conflicts with Hopper Studio on port 80. Stop the site
briefly, change RaspAP to port 8080, and start both services:

```bash
cd ~/hopper-site
docker compose stop
sudo sed -i 's/^[#[:space:]]*server\\.port[[:space:]]*=.*/server.port = 8080/' /etc/lighttpd/lighttpd.conf
grep -q '^[[:space:]]*server\\.port' /etc/lighttpd/lighttpd.conf || echo 'server.port = 8080' | sudo tee -a /etc/lighttpd/lighttpd.conf
sudo systemctl restart lighttpd
docker compose up -d
```

Open RaspAP at `http://drone-site.local:8080` while the Pi is still reachable
on the home network. Change the RaspAP administrator password immediately.

In RaspAP:

1. Configure the hotspot SSID as `drone_site`.
2. Select WPA2/WPA3 security and set the passphrase to `ew370drones`.
3. Keep the default hotspot address unless the school network conflicts with
   it. RaspAP normally uses `10.3.141.1`.
4. Start the hotspot and enable it at boot.

Students can then join:

```text
Network:  drone_site
Password: ew370drones
Site:     http://10.3.141.1/
Admin:    http://10.3.141.1:8080/
```

The classroom password is intentionally written here because it was specified
for student access. Use a different RaspAP administrator password.

## 5. Prefer `fidoh` when it is available

### Recommended: two Wi-Fi adapters

Use the onboard radio for the always-available `drone_site` hotspot and a USB
Wi-Fi adapter as the upstream client. In RaspAP, select the USB interface on the
Wi-Fi client page, scan for `fidoh`, and save its password. Give that connection
a higher priority than any other saved upstream network.

With two radios, `drone_site` remains available whether or not `fidoh` is
present. When `fidoh` is available the Pi uses it for Internet access; when it
is absent the local site and student AP still work.

If the original home-network profile is no longer wanted after setup, list and
remove it with NetworkManager:

```bash
nmcli connection show
sudo nmcli connection delete "HOME_NETWORK_NAME"
```

### One radio: experimental AP-STA mode

RaspAP documents an experimental AP-STA mode for running a client and hotspot
on one radio. Follow the current RaspAP AP-STA guide, then save `fidoh` as the
client network and `drone_site` as the hotspot. Test this exact Pi model under
classroom load before relying on it: channel changes, driver limitations, or a
missing upstream network can disrupt the hotspot.

If reliable fallback is required, use the two-adapter setup. It is simpler to
recover remotely and leaves the student AP available even while `fidoh` is
being scanned or reconnected.

## Browser limitation: Bluetooth and offline caching

Students can load and use the simulator from `http://10.3.141.1/`. However,
Web Bluetooth and service workers require a secure browser context. Browsers do
not normally treat a plain HTTP LAN address as secure, so **Connect drone** and
offline caching may be unavailable from that address.

For physical Bluetooth flight control, choose one of these approaches:

- install a trusted HTTPS certificate for a stable local hostname on every
  student device and add an HTTPS reverse proxy on the Pi; or
- use the packaged Hopper Studio desktop application on each student computer.

The desktop application is the simpler managed-classroom option. Do not teach
students to bypass browser security warnings or enable global insecure-origin
flags.

## Operations and troubleshooting

Check the site:

```bash
cd ~/hopper-site
docker compose ps
docker compose logs --tail=100 hopper-site
curl -I http://127.0.0.1/
```

Restart it:

```bash
cd ~/hopper-site
docker compose restart
```

Confirm which process owns the web ports:

```bash
sudo ss -ltnp | grep -E ':(80|8080)[[:space:]]'
```

If students can join the AP but cannot open the site, try the numeric address
`http://10.3.141.1/`, verify the container is healthy, and confirm lighttpd is
only listening on port 8080.

If the Docker build is killed, the Pi probably ran out of memory. Confirm that
swap is enabled, stop other applications, and retry the build. A Pi with 4 GB
or more is strongly recommended.

## References

- Raspberry Pi Imager:
  <https://www.raspberrypi.com/documentation/computers/getting-started.html>
- Docker convenience installer:
  <https://docs.docker.com/engine/install/debian/#install-using-the-convenience-script>
- RaspAP quick installer: <https://docs.raspap.com/quick/>
- RaspAP AP-STA warning and setup:
  <https://docs.raspap.com/features-experimental/ap-sta/>
