/*
 * optimiser_worker.js - Worker Thread for Running the Algorithm
 * SDGP 2025/26
 *
 * This runs in its own thread so the UI doesnt freeze while the
 * optimiser is crunching through hundreds of components.
 * Gets the params from main.js via workerData, runs the algo,
 * and sends the result back.
 */

const { parentPort, workerData } = require('worker_threads');
const { runOptimisation } = require('./optimiser.js');

// run it and send the result back to main thread
const result = runOptimisation(workerData);
parentPort.postMessage(result);
