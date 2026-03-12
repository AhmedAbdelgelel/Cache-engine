function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

module.exports = { byteSize };
