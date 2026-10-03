// SPDX-License-Identifier: Apache-2.0

// Durations: the design states them in seconds and minutes, while timers and
// clocks count milliseconds.

const msPerSecond = 1000;
const msPerMinute = 60 * msPerSecond;

export const seconds = (n: number) => n * msPerSecond;
export const minutes = (n: number) => n * msPerMinute;

// The whole minutes in a span of milliseconds, rounded down.
export const minutesIn = (ms: number) => Math.floor(ms / msPerMinute);
