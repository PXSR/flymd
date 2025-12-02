// main.js

// ---------------- 常量与配置 ----------------

const CONFIG_KEY = 'ai_rewriter_config';
const TEMPLATE_KEY = 'ai_rewriter_templates';

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.voct.top/v1',
  model: 'gemini-2.5-pro',
  apiKey: ''
};

// 默认模版
const DEFAULT_TEMPLATES = [
  {
    id: 'xhs_md',
    name: '✨ 小红书 (Markdown)',
    content: `你是一个小红书爆款文案专家。请将用户选中的内容改写为小红书风格。
要求：
1. **格式强制**：必须使用标准的 Markdown 语法。
2. **语气**：热情、活泼、口语化，多用“家人们”、“绝绝子”。
3. **Emoji**：全文穿插大量 Emoji。
4. **结构**：痛点引入 -> 核心种草 -> 结尾互动 + 标签。
5. **注意**：直接输出正文，不要把整个回答包裹在代码块中。`
  },
  {
    id: 'email_formal',
    name: '📧 商务邮件润色',
    content: `请将这段文本润色为专业的商务邮件风格。
要求：
1. 语气礼貌、专业、客观。
2. 使用标准的 Markdown 格式。
3. 修正错别字和语病。`
  }
];

let menuDisposers = [];

// ---------------- 生命周期 ----------------

export async function activate(context) {
  // 初始化数据
  await initTemplates(context);
  // 渲染菜单
  await refreshMenus(context);
  context.ui.notice('AI 改写助手已激活', 'ok');
}

export function deactivate() {
  disposeMenus();
}

// ---------------- 菜单逻辑 ----------------

function disposeMenus() {
  menuDisposers.forEach(d => d && d());
  menuDisposers = [];
}

async function refreshMenus(context) {
  disposeMenus();
  const templates = await getTemplates(context);

  // 1. 生成动作菜单
  const actionItems = templates.map(tpl => ({
    label: tpl.name,
    icon: '🪄',
    onClick: async (ctx) => {
      const selection = ctx?.selectedText || context.getSelection().text;
      await handleSelection(context, selection, tpl.content);
    }
  }));

  // 2. 生成管理菜单
  const manageItems = templates.map(tpl => ({
    label: `📝 编辑/删除: ${tpl.name}`,
    onClick: async () => handleEditTemplate(context, tpl)
  }));

  // 3. 注册主菜单
  const mainMenu = context.addMenuItem({
    label: 'AI 改写',
    children: [
      { type: 'group', label: '立即生成' },
      ...actionItems,
      { type: 'divider' },
      { type: 'group', label: '配置与管理' },
      {
        label: '➕ 新增模版 (表单)',
        onClick: () => handleAddTemplate(context)
      },
      {
        label: '🔧 管理模版',
        children: manageItems
      },
      { type: 'divider' },
      {
        label: '⚙️ API 设置',
        onClick: () => handleConfig(context) // 点击直接弹窗配置
      }
    ]
  });
  menuDisposers.push(mainMenu);

  // 4. 注册右键菜单
  const contextMenu = context.addContextMenuItem({
    label: 'AI 改写为...',
    icon: '📝',
    condition: (ctx) => ctx.selectedText && ctx.selectedText.length > 0,
    children: [
      ...actionItems,
      { type: 'divider' },
      {
        label: '保存选中为新提示词',
        icon: '💾',
        onClick: async (ctx) => handleAddTemplate(context, '', ctx.selectedText)
      }
    ]
  });
  menuDisposers.push(contextMenu);
}

// ---------------- 业务逻辑 (弹窗驱动) ----------------

/**
 * 处理 API 配置 (使用自定义弹窗)
 */
async function handleConfig(context) {
  const current = await getConfig(context);

  try {
    const formData = await showFormDialog({
      title: '⚙️ API 配置',
      fields: [
        { key: 'baseUrl', label: 'API Base URL', value: current.baseUrl, placeholder: 'https://api.openai.com/v1' },
        { key: 'model', label: '模型名称 (Model)', value: current.model, placeholder: 'gpt-3.5-turbo' },
        { key: 'apiKey', label: 'API Key', value: current.apiKey, type: 'password', placeholder: 'sk-...' }
      ]
    });

    if (formData) {
      await context.storage.set(CONFIG_KEY, formData);
      context.ui.notice('配置已保存 ✅', 'ok');
    }
  } catch (e) {
    // 用户取消或关闭
    console.log('User cancelled config');
  }
}

/**
 * 新增模版 (使用自定义弹窗)
 */
async function handleAddTemplate(context, defaultName = '', defaultContent = '') {
  try {
    const formData = await showFormDialog({
      title: '➕ 新增提示词模版',
      fields: [
        { key: 'name', label: '模版标题', value: defaultName, placeholder: '例如：知乎体' },
        { key: 'content', label: '提示词内容 (System Prompt)', value: defaultContent, type: 'textarea', height: '150px' }
      ]
    });

    if (formData && formData.name && formData.content) {
      const tpls = await getTemplates(context);
      tpls.push({
        id: Date.now().toString(),
        name: formData.name,
        content: formData.content
      });
      await saveTemplates(context, tpls);
      await refreshMenus(context);
      context.ui.notice(`模版“${formData.name}”已添加`, 'ok');
    }
  } catch (e) {
    // cancelled
  }
}

/**
 * 编辑模版 (使用自定义弹窗)
 */
async function handleEditTemplate(context, tpl) {
  // 先询问是要编辑还是删除
  // 这里暂时还用 confirm，因为这只是一个简单的二选一分支
  const wantDelete = await context.ui.confirm(`您想删除模版“${tpl.name}”吗？\n点击 [确定] 删除，点击 [取消] 编辑。`);
  
  if (wantDelete) {
    const tpls = await getTemplates(context);
    const filtered = tpls.filter(t => t.id !== tpl.id);
    await saveTemplates(context, filtered);
    await refreshMenus(context);
    context.ui.notice('模版已删除', 'ok');
    return;
  }

  // 进入编辑模式
  try {
    const formData = await showFormDialog({
      title: '📝 编辑模版',
      fields: [
        { key: 'name', label: '模版标题', value: tpl.name },
        { key: 'content', label: '提示词内容', value: tpl.content, type: 'textarea', height: '150px' }
      ]
    });

    if (formData) {
      const tpls = await getTemplates(context);
      const idx = tpls.findIndex(t => t.id === tpl.id);
      if (idx !== -1) {
        tpls[idx] = { ...tpls[idx], name: formData.name, content: formData.content };
        await saveTemplates(context, tpls);
        await refreshMenus(context);
        context.ui.notice('模版更新成功', 'ok');
      }
    }
  } catch (e) {
    // cancelled
  }
}

async function handleSelection(context, selectedText, systemPrompt) {
  if (!selectedText) {
    context.ui.showNotification('请先选中文字', { type: 'error' });
    return;
  }
  const config = await getConfig(context);
  if (!config.apiKey) {
    context.ui.showNotification('API 未配置', { type: 'error' });
    handleConfig(context);
    return;
  }

  const loadingId = context.ui.showNotification('AI 正在改写中... ⏳', { type: 'info', duration: 0 });

  try {
    const result = await requestAI(context, config, selectedText, systemPrompt);
    const sel = context.getSelection();
    context.replaceRange(sel.start, sel.end, result);
    context.ui.hideNotification(loadingId);
    context.ui.showNotification('成功 ✨', { type: 'success' });
  } catch (error) {
    context.ui.hideNotification(loadingId);
    context.ui.showNotification('错误: ' + error.message, { type: 'error', duration: 4000 });
  }
}

// ---------------- UI 工具库 (自定义表单弹窗) ----------------

/**
 * 在 DOM 中创建一个模态表单
 * @param {Object} options { title, fields: [{key, label, value, type, placeholder, height}] }
 * @returns Promise<Object|null>
 */
function showFormDialog({ title, fields }) {
  return new Promise((resolve, reject) => {
    // 1. 创建遮罩层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif;
    `;

    // 2. 创建表单容器
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--bg, #fff); 
      color: var(--fg, #333);
      padding: 20px; border-radius: 8px;
      width: 400px; max-width: 90vw;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      display: flex; flex-direction: column; gap: 15px;
    `;
    // 适配暗色模式简单的处理
    if (document.body.classList.contains('dark')) {
        modal.style.background = '#2d2d2d';
        modal.style.color = '#fff';
    }

    // 标题
    const header = document.createElement('h3');
    header.textContent = title;
    header.style.margin = '0 0 5px 0';
    modal.appendChild(header);

    // 字段生成
    const inputMap = {};

    fields.forEach(field => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '5px';

      const label = document.createElement('label');
      label.textContent = field.label;
      label.style.fontSize = '12px';
      label.style.fontWeight = 'bold';
      label.style.opacity = '0.8';

      let input;
      if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.style.height = field.height || '80px';
        input.style.resize = 'vertical';
      } else {
        input = document.createElement('input');
        input.type = field.type || 'text';
      }

      // 通用 Input 样式
      input.style.padding = '8px';
      input.style.border = '1px solid #ccc';
      input.style.borderRadius = '4px';
      input.style.background = 'transparent';
      input.style.color = 'inherit';
      input.value = field.value || '';
      if (field.placeholder) input.placeholder = field.placeholder;

      inputMap[field.key] = input;
      wrapper.appendChild(label);
      wrapper.appendChild(input);
      modal.appendChild(wrapper);
    });

    // 按钮区域
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '10px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => {
      document.body.removeChild(overlay);
      reject(new Error('User cancelled'));
    };

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.style.padding = '6px 16px';
    saveBtn.style.background = '#0ea5e9'; // flyMD blue
    saveBtn.style.color = '#fff';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.onclick = () => {
      const result = {};
      Object.keys(inputMap).forEach(key => {
        result[key] = inputMap[key].value;
      });
      document.body.removeChild(overlay);
      resolve(result);
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // 聚焦第一个输入框
    setTimeout(() => {
        const firstInput = modal.querySelector('input, textarea');
        if(firstInput) firstInput.focus();
    }, 50);
  });
}

// ---------------- 数据层 ----------------

async function getConfig(context) {
  const saved = await context.storage.get(CONFIG_KEY);
  return { ...DEFAULT_CONFIG, ...saved };
}

async function getTemplates(context) {
  const saved = await context.storage.get(TEMPLATE_KEY);
  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    return JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
  }
  return saved;
}

async function initTemplates(context) {
  const saved = await context.storage.get(TEMPLATE_KEY);
  if (!saved) await context.storage.set(TEMPLATE_KEY, DEFAULT_TEMPLATES);
}

async function saveTemplates(context, tpls) {
  await context.storage.set(TEMPLATE_KEY, tpls);
}

// ---------------- 网络层 ----------------

async function requestAI(context, config, selectedText, systemPrompt) {
  const payload = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: selectedText }
    ],
    temperature: 0.7
  };

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await context.http.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Code ${response.status}: ${errText.slice(0, 100)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回为空');
  return content;
}
