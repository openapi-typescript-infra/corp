/**
 * This is basically a specific implementation of short-uuid, to remove the dependency on uuid
 * which doesn't play nice in browsers.
 *
 * https://github.com/oculus42/short-uuid
 * MIT Licensed
 */
import anyBase from 'any-base';

const flickrBase58 = '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

interface PaddingParams {
  shortIdLength: number;
  consistentLength: boolean;
  paddingChar: string;
}

// Calculate length for the shortened ID
const getShortIdLength = (alphabetLength: number) =>
  Math.ceil(Math.log(2 ** 128) / Math.log(alphabetLength));

/**
 * Takes a UUID, strips the dashes, and translates.
 * @param {string} longId
 * @param {function(string)} translator
 * @param {Object} [paddingParams]
 * @returns {string}
 */
const shortenUUID = (
  longId: string,
  translator: (s: string) => string,
  paddingParams: PaddingParams,
) => {
  const translated = translator(longId.toLowerCase().replace(/-/g, ''));

  if (!paddingParams || !paddingParams.consistentLength) {
    return translated;
  }

  return translated.padStart(paddingParams.shortIdLength, paddingParams.paddingChar);
};

/**
 * Translate back to hex and turn back into UUID format, with dashes
 * @param {string} shortId
 * @param {function(string)} translator
 * @returns {string}
 */
const enlargeUUID = (shortId: string, translator: (s: string) => string) => {
  const uu1 = translator(shortId).padStart(32, '0');

  // Join the zero padding and the UUID and then slice it up with match
  const m = uu1.match(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})/);

  if (!m) {
    throw new Error('Invalid UUID');
  }

  // Accumulate the matches and join them.
  return [m[1], m[2], m[3], m[4], m[5]].join('-');
};

/**
 * @param {string} toAlphabet - Defaults to flickrBase58 if not provided
 * @param {Object} [options]
 *
 * @returns {{new: (function()),
 *  uuid: (function()),
 *  fromUUID: (function(string)),
 *  toUUID: (function(string)),
 *  alphabet: (string)}}
 */
const makeConvertor = (toAlphabet: string) => {
  // Default to Flickr 58
  const useAlphabet = toAlphabet || flickrBase58;

  // Default to baseOptions
  const selectedOptions = { consistentLength: true };

  // Check alphabet for duplicate entries
  if ([...new Set(Array.from(useAlphabet))].length !== useAlphabet.length) {
    throw new Error(
      'The provided Alphabet has duplicate characters resulting in unreliable results',
    );
  }

  const shortIdLength = getShortIdLength(useAlphabet.length);

  // Padding Params
  const paddingParams = {
    shortIdLength,
    consistentLength: selectedOptions.consistentLength,
    paddingChar: useAlphabet[0],
  };

  // UUIDs are in hex, so we translate to and from.
  const fromHex = anyBase(anyBase.HEX, useAlphabet);
  const toHex = anyBase(useAlphabet, anyBase.HEX);

  const translator = {
    fromUUID: (uuid: string) => shortenUUID(uuid, fromHex, paddingParams),
    toUUID: (shortUuid: string) => enlargeUUID(shortUuid, toHex),
    alphabet: useAlphabet,
    maxLength: shortIdLength,
  };

  Object.freeze(translator);

  return translator;
};

export const shortener = makeConvertor(flickrBase58);
