// iOS simulator/device paths, Android simulator/device paths, etc.
const PATH_REGEX = /(file:\/\/\/|\/data\/user\/[0-9]+\/|\/var\/mobile\/Containers\/Data\/Application\/[A-Z0-9-]+\/|\/Users\/[^/]+\/Library\/Developer\/CoreSimulator\/Devices\/[A-Z0-9-]+\/data\/Containers\/Data\/Application\/[A-Z0-9-]+\/)[^\s"']+/gi;

/**
 * サニタイズされた安全なパス（ファイル名のみ）を抽出する
 * 例: file:///data/user/0/com.app/files/abc.jpg -> [REDACTED_DIR]/abc.jpg
 */
export function sanitizePath(path: string | null | undefined): string {
  if (typeof path !== 'string') return '';
  return path.replace(PATH_REGEX, (match) => {
    const parts = match.split('/');
    const fileName = parts[parts.length - 1];
    return `[REDACTED_DIR]/${fileName}`;
  });
}

/**
 * オブジェクト内の機密なパス情報を再帰的にサニタイズする
 * 文字列が含まれていればパスのマスキングを試みる
 */
export function sanitizeLogObject(obj: any, maxDepth = 5, currentDepth = 0): any {
  if (currentDepth > maxDepth) return '[MAX_DEPTH_EXCEEDED]';
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return sanitizePath(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLogObject(item, maxDepth, currentDepth + 1));
  }

  if (typeof obj === 'object') {
    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: sanitizePath(obj.message),
        stack: sanitizePath(obj.stack),
      };
    }

    const sanitizedObj: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      sanitizedObj[key] = sanitizeLogObject(obj[key], maxDepth, currentDepth + 1);
    }
    return sanitizedObj;
  }

  return obj;
}
