export type CaseInsensitiveMap<T> = Record<string, T>;

export function wrapAsCaseInsensitiveMap<T>(
  existingObject: CaseInsensitiveMap<T>,
): CaseInsensitiveMap<T> {
  const caseInsensitiveObject: CaseInsensitiveMap<T> = {};

  // Populate the new object with lowercased keys
  for (const key in existingObject) {
    caseInsensitiveObject[key.toLowerCase()] = existingObject[key];
  }

  return new Proxy(caseInsensitiveObject, {
    get: (obj: CaseInsensitiveMap<T>, prop: string | symbol): T => {
      return obj[prop.toString().toLowerCase()];
    },
    set: (obj: CaseInsensitiveMap<T>, prop: string | symbol, value: T): boolean => {
      obj[prop.toString().toLowerCase()] = value;
      return true;
    },
    has: (obj: CaseInsensitiveMap<T>, prop: string | symbol): boolean => {
      return prop.toString().toLowerCase() in obj;
    },
    deleteProperty: (obj: CaseInsensitiveMap<T>, prop: string | symbol): boolean => {
      delete obj[prop.toString().toLowerCase()];
      return true;
    },
    ownKeys: (obj: CaseInsensitiveMap<T>): ArrayLike<string | symbol> => {
      const keys = Reflect.ownKeys(obj);
      return keys.map((key) => key.toString().toLowerCase());
    },
    getOwnPropertyDescriptor: (
      obj: CaseInsensitiveMap<T>,
      prop: string | symbol,
    ): PropertyDescriptor | undefined => {
      const key = prop.toString().toLowerCase();
      return Object.getOwnPropertyDescriptor(obj, key);
    },
  });
}
