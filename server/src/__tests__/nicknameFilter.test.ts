import { describe, it, expect } from 'vitest';
import { validateNickname } from '../utils/nicknameFilter';

describe('nicknameFilter', () => {
  it('正常なニックネームが通過すること', () => {
    const result = validateNickname('Player1');
    expect(result.valid).toBe(true);
    expect(result.nickname).toBe('Player1');
  });

  it('空文字が拒否されること', () => {
    const result = validateNickname('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('空白のみが拒否されること', () => {
    const result = validateNickname('   ');
    expect(result.valid).toBe(false);
  });

  it('17文字以上が拒否されること', () => {
    const result = validateNickname('a'.repeat(17));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
  });

  it('16文字がちょうど許可されること', () => {
    const result = validateNickname('a'.repeat(16));
    expect(result.valid).toBe(true);
  });

  it('1文字が許可されること', () => {
    const result = validateNickname('A');
    expect(result.valid).toBe(true);
  });

  it('禁止ワードを含むニックネームが拒否されること', () => {
    const result = validateNickname('testadmin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('banned');
  });

  it('禁止ワードの大文字小文字区別なし', () => {
    const result = validateNickname('ADMIN');
    expect(result.valid).toBe(false);
  });

  it('前後の空白がトリムされること', () => {
    const result = validateNickname('  hello  ');
    expect(result.valid).toBe(true);
    expect(result.nickname).toBe('hello');
  });
});
