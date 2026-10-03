// SPDX-License-Identifier: Apache-2.0

// The design states durations in seconds and minutes; timers and clocks count
// milliseconds.

const msPerSecond = 1000;
const msPerMinute = 60 * msPerSecond;

export const seconds = (n: number) => n * msPerSecond;
export const minutes = (n: number) => n * msPerMinute;

export const minutesIn = (ms: number) => Math.floor(ms / msPerMinute);
