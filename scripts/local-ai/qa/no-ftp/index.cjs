// Satisfy the optional transport import while refusing all FTP operations.
exports.Client = class DisabledFTPClient {
  constructor() { throw new Error('ShowNight-QA: FTP ist deaktiviert.'); }
};
