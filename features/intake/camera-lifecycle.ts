export async function settleCameraAction(
  action: () => void | Promise<unknown>,
) {
  try {
    await action();
    return true;
  } catch {
    // iOS may reject video and torch operations while a camera track is closing.
    return false;
  }
}
