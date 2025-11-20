// 右键菜单演示扩展
// 展示 addContextMenuItem API 的各种用法

export function activate(context) {
  // 0. 测试菜单（无条件，始终显示，方便测试子菜单）
  context.addContextMenuItem({
    label: '测试子菜单',
    icon: '🧪',
    children: [
      {
        type: 'group',
        label: '测试分组'
      },
      {
        label: '选项 1',
        note: '无条件',
        onClick: () => {
          context.ui.notice('点击了选项 1', 'ok');
        }
      },
      {
        label: '选项 2',
        note: '无条件',
        onClick: () => {
          context.ui.notice('点击了选项 2', 'ok');
        }
      },
      { type: 'divider' },
      {
        label: '选项 3',
        icon: '✨',
        onClick: () => {
          context.ui.notice('点击了选项 3', 'ok');
        }
      }
    ]
  });

  // 1. 简单的文本转换菜单项（仅在有选中文本时显示）
  context.addContextMenuItem({
    label: '转换为大写',
    icon: '🔤',
    condition: (ctx) => ctx.selectedText.length > 0,
    onClick: (ctx) => {
      const upperText = ctx.selectedText.toUpperCase();
      context.replaceRange(
        context.getSelection().start,
        context.getSelection().end,
        upperText
      );
      context.ui.notice('已转换为大写', 'ok', 1500);
    }
  });

  // 2. 带子菜单的文本工具
  context.addContextMenuItem({
    label: '文本工具',
    icon: '🛠️',
    children: [
      {
        type: 'group',
        label: '大小写'
      },
      {
        label: '转大写',
        note: 'UPPER',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const upper = ctx.selectedText.toUpperCase();
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            upper
          );
          context.ui.notice('转换成功', 'ok');
        }
      },
      {
        label: '转小写',
        note: 'lower',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const lower = ctx.selectedText.toLowerCase();
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            lower
          );
          context.ui.notice('转换成功', 'ok');
        }
      },
      {
        label: '首字母大写',
        note: 'Capitalize',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const capitalized = ctx.selectedText.charAt(0).toUpperCase() +
                              ctx.selectedText.slice(1).toLowerCase();
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            capitalized
          );
          context.ui.notice('转换成功', 'ok');
        }
      },
      { type: 'divider' },
      {
        type: 'group',
        label: '命名风格'
      },
      {
        label: '驼峰命名',
        note: 'camelCase',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const camelCase = ctx.selectedText
            .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
            .replace(/^[A-Z]/, c => c.toLowerCase());
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            camelCase
          );
          context.ui.notice('已转换为驼峰命名', 'ok');
        }
      },
      {
        label: '蛇形命名',
        note: 'snake_case',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const snakeCase = ctx.selectedText
            .replace(/([A-Z])/g, '_$1')
            .replace(/[-\s]+/g, '_')
            .toLowerCase()
            .replace(/^_/, '');
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            snakeCase
          );
          context.ui.notice('已转换为蛇形命名', 'ok');
        }
      },
      {
        label: '短横线命名',
        note: 'kebab-case',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const kebabCase = ctx.selectedText
            .replace(/([A-Z])/g, '-$1')
            .replace(/[_\s]+/g, '-')
            .toLowerCase()
            .replace(/^-/, '');
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            kebabCase
          );
          context.ui.notice('已转换为短横线命名', 'ok');
        }
      },
      { type: 'divider' },
      {
        type: 'group',
        label: '空格处理'
      },
      {
        label: '去除所有空格',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const trimmed = ctx.selectedText.replace(/\s+/g, '');
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            trimmed
          );
          context.ui.notice('已去除空格', 'ok');
        }
      },
      {
        label: '压缩多余空格',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const compressed = ctx.selectedText.replace(/\s+/g, ' ').trim();
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            compressed
          );
          context.ui.notice('已压缩空格', 'ok');
        }
      }
    ]
  });

  // 3. 格式化工具
  context.addContextMenuItem({
    label: '格式化',
    icon: '🎨',
    children: [
      {
        label: '格式化 JSON',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          try {
            const formatted = JSON.stringify(JSON.parse(ctx.selectedText), null, 2);
            context.replaceRange(
              context.getSelection().start,
              context.getSelection().end,
              formatted
            );
            context.ui.notice('JSON 格式化成功', 'ok', 2000);
          } catch (err) {
            context.ui.notice('格式化失败：' + err.message, 'err', 3000);
          }
        }
      },
      {
        label: '压缩 JSON',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          try {
            const minified = JSON.stringify(JSON.parse(ctx.selectedText));
            context.replaceRange(
              context.getSelection().start,
              context.getSelection().end,
              minified
            );
            context.ui.notice('JSON 压缩成功', 'ok', 2000);
          } catch (err) {
            context.ui.notice('压缩失败：' + err.message, 'err', 3000);
          }
        }
      },
      { type: 'divider' },
      {
        label: 'URL 编码',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          const encoded = encodeURIComponent(ctx.selectedText);
          context.replaceRange(
            context.getSelection().start,
            context.getSelection().end,
            encoded
          );
          context.ui.notice('URL 编码完成', 'ok');
        }
      },
      {
        label: 'URL 解码',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          try {
            const decoded = decodeURIComponent(ctx.selectedText);
            context.replaceRange(
              context.getSelection().start,
              context.getSelection().end,
              decoded
            );
            context.ui.notice('URL 解码完成', 'ok');
          } catch (err) {
            context.ui.notice('解码失败：' + err.message, 'err', 3000);
          }
        }
      },
      { type: 'divider' },
      {
        label: 'Base64 编码',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          try {
            const encoded = btoa(unescape(encodeURIComponent(ctx.selectedText)));
            context.replaceRange(
              context.getSelection().start,
              context.getSelection().end,
              encoded
            );
            context.ui.notice('Base64 编码完成', 'ok');
          } catch (err) {
            context.ui.notice('编码失败：' + err.message, 'err', 3000);
          }
        }
      },
      {
        label: 'Base64 解码',
        condition: (ctx) => ctx.selectedText.length > 0,
        onClick: (ctx) => {
          try {
            const decoded = decodeURIComponent(escape(atob(ctx.selectedText)));
            context.replaceRange(
              context.getSelection().start,
              context.getSelection().end,
              decoded
            );
            context.ui.notice('Base64 解码完成', 'ok');
          } catch (err) {
            context.ui.notice('解码失败：' + err.message, 'err', 3000);
          }
        }
      }
    ]
  });

  // 4. 插入工具（无需选中文本）
  context.addContextMenuItem({
    label: '插入',
    icon: '📝',
    children: [
      {
        label: '当前日期时间',
        onClick: (ctx) => {
          const now = new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          context.insertAtCursor(now);
          context.ui.notice('已插入日期时间', 'ok');
        }
      },
      {
        label: 'ISO 时间戳',
        onClick: (ctx) => {
          const iso = new Date().toISOString();
          context.insertAtCursor(iso);
          context.ui.notice('已插入 ISO 时间戳', 'ok');
        }
      },
      {
        label: 'Unix 时间戳',
        onClick: (ctx) => {
          const unix = Math.floor(Date.now() / 1000).toString();
          context.insertAtCursor(unix);
          context.ui.notice('已插入 Unix 时间戳', 'ok');
        }
      },
      { type: 'divider' },
      {
        label: 'UUID',
        onClick: (ctx) => {
          // 简单的 UUID v4 生成
          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
          context.insertAtCursor(uuid);
          context.ui.notice('已插入 UUID', 'ok');
        }
      },
      {
        label: '随机字符串',
        note: '8位',
        onClick: (ctx) => {
          const random = Math.random().toString(36).substring(2, 10);
          context.insertAtCursor(random);
          context.ui.notice('已插入随机字符串', 'ok');
        }
      }
    ]
  });

  // 5. 信息查看（仅查看，不修改）
  context.addContextMenuItem({
    label: '查看信息',
    icon: 'ℹ️',
    condition: (ctx) => ctx.selectedText.length > 0,
    onClick: (ctx) => {
      const text = ctx.selectedText;
      const lines = text.split('\n').length;
      const words = text.split(/\s+/).filter(w => w.length > 0).length;
      const chars = text.length;
      const charsNoSpace = text.replace(/\s/g, '').length;

      const info = [
        `字符数：${chars}`,
        `非空字符：${charsNoSpace}`,
        `单词数：${words}`,
        `行数：${lines}`,
        `模式：${ctx.mode}`,
        ctx.filePath ? `文件：${ctx.filePath.split(/[/\\]/).pop()}` : ''
      ].filter(Boolean).join(' | ');

      context.ui.notice(info, 'ok', 5000);
    }
  });

  context.ui.notice('右键菜单演示扩展已激活', 'ok', 2000);
}

export function deactivate() {
  console.log('右键菜单演示扩展已停用');
}
