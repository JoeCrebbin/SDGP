/*
 * optimiser_worker.js - Worker Thread Entry Point
 *
 * This file runs inside a separate thread (not the main Electron thread).
 * It receives the optimisation parameters via workerData, runs the algorithm,
 * and sends the result back to the main thread via postMessage.
 *
 * This prevents the UI from freezing during long-running optimisations.
 * See: https://nodejs.org/api/worker_threads.html
 */

const { parentPort, workerData } = require('worker_threads');
const { runOptimisation } = require('./optimiser.js');

// Run the algorithm with the data passed from main.js
const result = runOptimisation(workerData);

// Send the result back to the main thread
parentPort.postMessage(result);
