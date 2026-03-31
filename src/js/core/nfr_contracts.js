const ALGORITHM_VERSION = 'bfd-ffd-v1.1.0';

const PERF_TARGETS_MS_P95 = Object.freeze({
  validation: Object.freeze({
    small: 250,
    medium: 800,
    large: 2000
  }),
  optimization: Object.freeze({
    small: 1200,
    medium: 4000,
    large: 9000
  }),
  export: Object.freeze({
    small: 800,
    medium: 2500,
    large: 6000
  })
});

function bucketByRows(rowCount) {
  const n = Number(rowCount) || 0;
  if (n <= 500) return 'small';
  if (n <= 5000) return 'medium';
  return 'large';
}

module.exports = {
  ALGORITHM_VERSION,
  PERF_TARGETS_MS_P95,
  bucketByRows
};
