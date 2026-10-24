/**
 * Phone turning via deviceorientation.
 *
 * Raw alpha cannot be used as heading: held upright like a torch (beta ≈ 90°)
 * alpha/gamma couple through gimbal lock and jump. Instead build the rotation
 * matrix (W3C Z-X'-Y'' convention), take the direction the BACK of the phone
 * (device −Z) points in the earth frame, project onto the horizontal plane,
 * and take atan2. If the projection is short (< 0.2) hold the last heading.
 */

const DEG = Math.PI / 180;

/**
 * Heading in degrees (0 = north, increasing clockwise) from a deviceorientation
 * sample, or null when the phone's back points too close to vertical.
 */
export function yawFromOrientation(alpha: number, beta: number, gamma: number): number | null {
  const a = alpha * DEG;
  const b = beta * DEG;
  const g = gamma * DEG;
  // Third column of Rz(α)·Rx(β)·Ry(γ): device +Z expressed in the earth frame
  // (x east, y north, z up).
  const zx = Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
  const zy = Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
  // Back of the phone is −Z; project onto the horizontal plane.
  const vx = -zx;
  const vy = -zy;
  const len = Math.hypot(vx, vy);
  if (len < 0.2) return null;
  const deg = Math.atan2(vx, vy) / DEG; // 0 = north, clockwise
  return (deg + 360) % 360;
}

const wrap360 = (d: number) => ((d % 360) + 360) % 360;

/** Signed shortest delta a−b in (−180, 180]. */
const deltaAngle = (a: number, b: number) => {
  let d = wrap360(a - b);
  if (d > 180) d -= 360;
  return d;
};

export class OrientationTracker {
  /** Degrees. Smoothed absolute phone heading, or null before first sample. */
  heading: number | null = null;
  private baseline: number | null = null;
  private raw: number | null = null;
  private lastSampleAt = 0;
  private listener = (e: DeviceOrientationEvent) => this.onSample(e);
  private attached = false;
  /** levelHeading offset applied so start pose = level's playerHeading. */
  private levelHeading = 0;
  private smoothing = 0.3; // low-pass per sample

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('deviceorientation', this.listener, true);
  }

  detach(): void {
    window.removeEventListener('deviceorientation', this.listener, true);
    this.attached = false;
  }

  /** Capture whatever direction the phone currently faces as the level start. */
  resetBaseline(levelHeadingDeg: number): void {
    this.levelHeading = levelHeadingDeg;
    this.baseline = this.raw;
    this.heading = levelHeadingDeg;
  }

  onSample(e: DeviceOrientationEvent): void {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const yaw = yawFromOrientation(e.alpha, e.beta, e.gamma);
    this.lastSampleAt = performance.now();
    if (yaw === null) return; // phone pointing up/down — hold last heading
    this.raw = yaw;
    if (this.baseline === null) this.baseline = yaw;
    const target = wrap360(this.levelHeading + deltaAngle(yaw, this.baseline));
    if (this.heading === null) {
      this.heading = target;
    } else {
      const d = deltaAngle(target, this.heading);
      // Snap inside a small band — pure EMA asymptotes toward the target and
      // gyro noise keeps the heading micro-drifting when holding still.
      this.heading = Math.abs(d) < 0.12 ? target : wrap360(this.heading + d * this.smoothing);
    }
  }

  /** ms since the most recent usable sample (∞ if none yet). */
  sinceLastSample(now: number): number {
    return this.lastSampleAt === 0 ? Infinity : now - this.lastSampleAt;
  }

  /** iOS permission — must be called inside a user gesture. */
  static async requestPermission(): Promise<void> {
    try {
      const doe = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof doe.requestPermission === 'function') await doe.requestPermission();
    } catch { /* denied or unsupported */ }
    try {
      const dme = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof dme.requestPermission === 'function') await dme.requestPermission();
    } catch { /* denied or unsupported */ }
  }
}
