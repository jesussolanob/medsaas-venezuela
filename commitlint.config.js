module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'ci']],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-max-length': [2, 'always', 100],
  },
};
