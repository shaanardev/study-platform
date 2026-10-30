export const registerTestCases = <Case>(
  cases: readonly Case[],
  register: (testCase: Case) => void,
): void => {
  cases.forEach(register);
};
