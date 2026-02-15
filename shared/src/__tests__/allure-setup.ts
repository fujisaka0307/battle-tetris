/// <reference types="vitest/globals" />
import { parentSuite, suite } from 'allure-js-commons';

beforeEach(() => {
  parentSuite('ユニットテスト');
  suite('Shared');
});
