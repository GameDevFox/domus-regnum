export const ExpectCalls = (mockFn: jest.Mock) => (...expected: any) => {
  const actual = mockFn.mock.calls;
  expect(actual).toEqual(expected);
  mockFn.mockReset();
};
