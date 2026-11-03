// Shared numbers for the 3D invitation. World units; y is up, ground at 0.
// The road runs toward +z: envelope → fork 1 → … → fork 4 → destination.

// Envelope PNGs are 3:4 with the envelope in the middle of the frame.
export const IMG_W = 4;
export const IMG_H = (IMG_W * 4) / 3;
export const ENV_W = IMG_W * 0.725;
/** After the flip, image row v (0 = top) sits at this z. */
export const vToZ = (v: number) => IMG_H * (0.5 - v);

export const ROAD_W = 0.62;
export const ROAD_H = 0.07;
export const ROAD_BEVEL = 0.05;
export const ROAD_START_Z = vToZ(0.64);

export const FORK_COUNT = 4;
export const J0 = 2.6;
export const DIAMOND_LEN = 9;
export const LINK_LEN = 4;
export const junctionZ = (k: number) => J0 + k * (DIAMOND_LEN + LINK_LEN);
export const DEST_Z = junctionZ(FORK_COUNT) + 0.9;
/** Signposts stand inside each fork, this far past the junction. */
export const SIGN_DZ = 1.9;

/*
 * Scroll timeline in viewport heights (u). The stage pins for TOTAL screens.
 *   hero   envelope flips, opens, road rolls out, title
 *   swing  camera orbits round behind the envelope to look down the road
 *   per fork: dwell (signs up, choose) then travel (follow the chosen path)
 *   end    rise over the destination seal and fade to paper
 */
export const T = { hero: 6, swing: 2.4, dwell: 1.3, travel: 3.2, end: 2 };
export const forkStart = (k: number) => T.hero + T.swing + k * (T.dwell + T.travel);
export const END_START = forkStart(FORK_COUNT);
export const TOTAL = END_START + T.end;
