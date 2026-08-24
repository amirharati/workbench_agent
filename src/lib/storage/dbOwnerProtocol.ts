/**
 * Protocol shared by the offscreen owner and both child workers.
 *
 * The service worker is copied from public/ rather than bundled by Vite, so its
 * mirrored value is guarded by dbOwnerProtocol.contract.test.ts.
 */
export const DB_OWNER_PROTOCOL_VERSION = 29;
