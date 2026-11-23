# Verify Ruffle compatibility for the SWF set

Type: research
Status: closed
Blocked by:

## Question

Can Ruffle actually run this client, including the network bridge?

## Resolution

- Self-hosted Ruffle 0.8.0 renders the Hebrew Flash login screen in Chromium using `wgpu-webgl`; no JS errors.
- `socketProxy` maps Flash `XMLSocket` targets to `/ws`; the bridge reaches the SmartFox TCP stack and the full session handshake succeeds.
- Compatibility shims `MKP_1.swf` / `MKP_2.swf` were copied from `MKP_12001.swf`.
- 6,089 SWFs were not individually compatibility-certified; the visual world render after `joinOK` is still unverified in headless automation.
- Debug logging was reverted: it flooded the console with ~10k shader messages.
