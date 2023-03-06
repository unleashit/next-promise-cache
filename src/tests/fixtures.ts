export type User = {
  id: string;
  name: string;
};

const dummyNames = [
  'fred',
  'janet',
  'mary',
  'john',
  'amy',
  'steve',
  'michelle',
  'bill',
  'dorothy',
  'elmer',
  'maggie',
  'tony',
];

export const users: User[] = dummyNames.map((name, i) => ({
  id: `${i + 1}`,
  name,
}));

export const newUser = {
  id: (dummyNames.length + 1).toString(),
  name: 'blarg',
};

export const notFound = { error: '404' };
