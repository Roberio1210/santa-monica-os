export type CameraStatus = "online" | "offline" | "sem_informacao";

export interface Camera {
  id: string;
  name: string;
  location: string;
  model: string;
  ipMasked: string;
  status: CameraStatus;
  lastCheck: string;
}
