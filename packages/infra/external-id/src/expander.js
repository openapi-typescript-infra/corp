/**
 * This self contained function is suitable for other environments like Snowflake
 * that just want to expand short UUIDs and don't want broader capabilities.
 */
function expandShortUUID(shortUuid) {
  const flickrBase58 = '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

  function base58ToHex(shortId) {
    let hex = '';
    for (let i = 0; i < shortId.length; i++) {
      let carry = flickrBase58.indexOf(shortId[i]);
      if (carry === -1) {
        throw new Error('Invalid character found in Short UUID');
      }
      let temp = '';
      for (let j = hex.length - 1; j >= 0; j--) {
        carry += flickrBase58.length * parseInt(hex[j], 16);
        temp = (carry % 16).toString(16) + temp;
        carry = Math.floor(carry / 16);
      }
      while (carry > 0) {
        temp = (carry % 16).toString(16) + temp;
        carry = Math.floor(carry / 16);
      }
      hex = temp;
    }
    while (hex.length < 32) {
      hex = '0' + hex; // pad with zeros
    }
    return hex;
  }

  const hex = base58ToHex(shortUuid.split('_').pop());
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// eslint-disable-next-line import/no-default-export
export default expandShortUUID;
