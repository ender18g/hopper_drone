export const JAVASCRIPT_STARTER_PROGRAM = `await drone.takeOff(); // Take off and wait until the drone is ready.
await drone.wait(2); // Wait for 2 seconds.
await drone.fly("forward", 2, 15); // Fly forward for 2 seconds at 15% power.
await drone.takePicture(); // Take and store a photo from the current camera view.
await drone.rotate(180, "clockwise"); // Turn clockwise by 180 degrees.
await drone.fly("forward", 2, 15); // Fly forward for 2 seconds at 15% power.
`;
