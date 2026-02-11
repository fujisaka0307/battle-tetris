import { NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH } from '@battle-tetris/shared';

/**
 * 禁止ワードリスト（基本的な範囲）
 */
const BANNED_WORDS: readonly string[] = [
  'admin',
  'system',
  'moderator',
  'fuck',
  'shit',
  'ass',
  'dick',
  'porn',
  'sex',
  'kill',
  'death',
  'nazi',
  'nigger',
  'nigga',
];

export interface NicknameValidationResult {
  valid: boolean;
  nickname: string;
  error?: string;
}

/**
 * ニックネームをバリデーションしてサニタイズする。
 *
 * - 前後の空白をトリム
 * - 文字数チェック（1〜16文字）
 * - 禁止ワードチェック（大文字小文字区別なし）
 */
export function validateNickname(raw: string): NicknameValidationResult {
  const nickname = raw.trim();

  if (nickname.length < NICKNAME_MIN_LENGTH) {
    return { valid: false, nickname, error: 'Nickname is too short' };
  }

  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return { valid: false, nickname, error: 'Nickname is too long' };
  }

  const lower = nickname.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      return { valid: false, nickname, error: 'Nickname contains a banned word' };
    }
  }

  return { valid: true, nickname };
}
