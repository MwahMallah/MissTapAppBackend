// ---------------- Types ----------------

import { JwtPayload } from "jsonwebtoken";

export type DeviceId = string;
export type PairId = string;
export type InviteCode = string;

export interface DeviceRecord {
  expoPushToken: string | null;
}

export interface PairRecord {
  a: DeviceId;
  b: DeviceId | null;
}

export interface AuthTokenPayload extends JwtPayload {
  deviceId: DeviceId;
}

export interface TapRequestBody {
  pairId: PairId;
  x: number; // normalized [0..1]
  y: number; // normalized [0..1]
}

export interface RegisterDeviceBody {
  deviceId: DeviceId;
  expoPushToken?: string;
}

export interface JoinPairBody {
  code: InviteCode;
}

export interface TapEvent {
  type: "tap";
  pairId: PairId;
  from: DeviceId;
  to: DeviceId;
  x: number;
  y: number;
  ts: number;
}

// Extend ws with optional deviceId
export type AuthedWebSocket = WebSocket & { deviceId?: DeviceId };

// Extend express Request with user payload
export type AuthedRequest = Request & { user?: AuthTokenPayload };
