const fs = require('fs');
const path = require('path');
const { extractStageContent } = require('./extract-stage');
const { loadAllStages } = require('./find-projects');


/**
 * Конвертирует простой Markdown в HTML
 * Обрабатывает списки, параграфы, переносы строк и изображения
 */
function markdownToHtml(text, screenshotProcessor = null) {
  if (!text) return '';
  
  let html = '';
  const lines = text.split('\n');
  let inList = false;
  let listType = null; // 'ol' или 'ul'
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Пропускаем пустые строки
    if (!line) {
      if (inList) {
        html += `</${listType}>\n`;
        inList = false;
        listType = null;
      }
      continue;
    }
    
    // Обрабатываем Markdown-изображения: ![alt](path)
    const imageMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      if (inList) {
        html += `</${listType}>\n`;
        inList = false;
        listType = null;
      }
      
      const alt = imageMatch[1];
      const imagePath = imageMatch[2];
      
      // Если есть процессор скриншотов, используем его
      if (screenshotProcessor && (imagePath.includes('screenshots/ru/') || imagePath.includes('screenshots/en/'))) {
        const fileName = imagePath.split('/').pop();
        const imageHtml = screenshotProcessor(fileName, alt);
        if (imageHtml) {
          html += imageHtml;
          continue;
        }
      }
      
      // Иначе просто пропускаем (или можно оставить placeholder)
      continue;
    }
    
    // Заголовки
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        html += `</${listType}>\n`;
        inList = false;
        listType = null;
      }
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      html += `<h${level}>${processInlineMarkdown(headingText)}</h${level}>\n`;
      continue;
    }
    
    // Нумерованный список (1. 2. 3. или 1) 2) 3)) - конвертируем в маркированный
    const numberedMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numberedMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) html += `</${listType}>\n`;
        html += '<ul>\n';
        inList = true;
        listType = 'ul';
      }
      html += `<li>${processInlineMarkdown(numberedMatch[2])}</li>\n`;
      continue;
    }
    
    // Маркированный список (- или *)
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) html += `</${listType}>\n`;
        html += '<ul>\n';
        inList = true;
        listType = 'ul';
      }
      html += `<li>${processInlineMarkdown(bulletMatch[1])}</li>\n`;
      continue;
    }
    
    // Обычный текст
    if (inList) {
      html += `</${listType}>\n`;
      inList = false;
      listType = null;
    }
    
    // Если строка не пустая и не список, делаем параграф
    html += `<p>${processInlineMarkdown(line)}</p>\n`;
  }
  
  // Закрываем список, если он остался открытым
  if (inList) {
    html += `</${listType}>\n`;
  }
  
  return html;
}

// Обработка inline Markdown (жирный, курсив, ссылки)
function processInlineMarkdown(text) {
  if (!text) return '';
  // Экранируем HTML (сначала экранируем &, потом < и >)
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  // Жирный текст
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Курсив
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Ссылки
  text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Обратные кавычки (код) - заменяем на экранированные
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  return text;
}

// Читаем конфигурацию
console.log('📖 Читаю конфигурацию...');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf-8'));
console.log(`✅ Конфигурация загружена: ${config.projectName}`);

// Загружаем все проекты для получения их путей
const { findProjects } = require('./find-projects');
const projects = findProjects();
console.log(`📁 Найдено проектов: ${projects.length}`);

// Собираем описание и ссылку из первого найденного проекта (или можно сделать для каждого проекта отдельно)
let projectDescription = '';
let projectUrl = config.projectUrl || '';

if (projects.length > 0) {
  // Берем первый проект (или можно сделать для каждого проекта отдельно)
  const firstProject = projects[0];
  
  // Проверяем описание проекта в папке проекта (intro.md в корне или в stages/)
  let introPath = path.join(firstProject.dir, 'intro.md');
  if (!fs.existsSync(introPath)) {
    introPath = path.join(firstProject.dir, 'stages', 'intro.md');
  }
  if (fs.existsSync(introPath)) {
    projectDescription = fs.readFileSync(introPath, 'utf-8').trim();
  } else {
    console.warn(`⚠️  Файл intro.md не найден в проекте ${firstProject.name}`);
    console.warn(`   Создайте файл input/${firstProject.name}/intro.md или input/${firstProject.name}/stages/intro.md с описанием проекта`);
  }
  
  // Проверяем ссылку на проект в папке проекта
  const projectUrlPath = path.join(firstProject.dir, 'project-url.txt');
  if (fs.existsSync(projectUrlPath)) {
    projectUrl = fs.readFileSync(projectUrlPath, 'utf-8').trim();
  } else if (!projectUrl) {
    console.warn(`⚠️  Файл project-url.txt не найден в проекте ${firstProject.name}`);
    console.warn(`   Создайте файл input/${firstProject.name}/project-url.txt со ссылкой на проект`);
  }
} else {
  console.warn('⚠️  Не найдено ни одного проекта в input/ (формат: *_log)');
}

// Читаем шаблон дневника
const templatePath = path.join(__dirname, '../templates/diary-template.html');
if (!fs.existsSync(templatePath)) {
  console.error('❌ Шаблон diary-template.html не найден!');
  console.error('   Путь:', templatePath);
  process.exit(1);
}

let template = fs.readFileSync(templatePath, 'utf-8');
console.log('✅ Шаблон загружен');

// Загружаем все этапы из всех проектов
console.log('📚 Загружаю этапы из проектов...');
const allStages = loadAllStages();
console.log(`📊 Найдено этапов: ${allStages.length}`);

if (allStages.length === 0) {
  console.error('❌ Не найдено ни одного проекта в input/ (формат: *_log)');
  console.error('   Убедитесь, что папки проектов имеют формат: input/название_лога/stages/stages-index.json');
  console.error('   Или что файлы этапов существуют (проверьте stages-index.json)');
  // Не завершаем скрипт - создадим пустой дневник
}

// Сортируем этапы по дате
const sortedStages = [...allStages].sort((a, b) => {
  return new Date(a.date) - new Date(b.date);
});

console.log(`📚 Найдено ${sortedStages.length} этапов из ${new Set(sortedStages.map(s => s.projectName)).size} проектов\n`);

// Группируем этапы по проектам для оглавления
const projectsMap = new Map();
sortedStages.forEach((stageMeta, index) => {
  if (!projectsMap.has(stageMeta.projectName)) {
    projectsMap.set(stageMeta.projectName, []);
  }
  projectsMap.get(stageMeta.projectName).push({
    ...stageMeta,
    index: index
  });
});

// Функция для генерации оглавления на главной странице (для одного языка)
const generateMainTableOfContents = (lang) => {
  const isEn = lang === 'en';
  if (sortedStages.length === 0) return '';
  
  let toc = '<div class="stage-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 40px;">';
  toc += `<h3 style="margin-top: 0;">${isEn ? 'Projects' : 'Проекты'}</h3>`;
  toc += '<ul style="list-style: none; padding-left: 0;">';
  
  projectsMap.forEach((stages, projectName) => {
    const displayName = projectName.replace(/_log$/, '');
    const projectPageUrl = `${displayName}/`; // Относительный путь к папке проекта (внутри языковой папки)
    
    toc += `<li style="margin-bottom: 15px;">`;
    toc += `<a href="${projectPageUrl}" style="color: #2c3e50; text-decoration: none; font-size: 1.2em; font-weight: bold; border-bottom: 2px solid #3498db; padding-bottom: 5px;">${displayName}</a>`;
    const stagesText = isEn ? 'stages' : 'этапов';
    toc += ` <span style="color: #95a5a6; font-size: 0.9em;">(${stages.length} ${stagesText})</span>`;
    toc += `</li>`;
  });
  
  toc += '</ul>';
  toc += '</div>';
  return toc;
};

const tableOfContentsRu = generateMainTableOfContents('ru');
const tableOfContentsEn = generateMainTableOfContents('en');

// На главной странице не показываем этапы, только оглавление
// Этапы генерируются только для отдельных страниц проектов
let stagesHTML = '';

// На главной странице не показываем описание проекта
let projectDescriptionBlock = '';

// Формируем блок со ссылкой на проект (простое предложение после описания)
let projectLinkBlock = '';
if (projectUrl && projectUrl.trim() !== '') {
  projectLinkBlock = `<p>Текущая реализация на: <a href="${projectUrl}" target="_blank" rel="noopener noreferrer">${projectUrl}</a></p>`;
}

// Формируем ссылку в конце страницы (для SEO)
let projectLinkFooter = '';
if (projectUrl && projectUrl.trim() !== '') {
  projectLinkFooter = `<p style="margin-top: 20px;">Рабочая версия проекта доступна по адресу: <a href="${projectUrl}" target="_blank" rel="noopener noreferrer">${projectUrl}</a></p>`;
}

// Обновляем ссылки в оглавлении для работы с языковыми папками
// (ссылки уже правильные, так что ничего не делаем)

// Формируем SEO meta-теги для ссылки на проект
let projectUrlMeta = '';
if (projectUrl && projectUrl.trim() !== '') {
  projectUrlMeta = `<link rel="canonical" href="${projectUrl}">\n    <meta property="og:url" content="${projectUrl}">\n    <meta name="twitter:url" content="${projectUrl}">`;
}

// Очищаем описание от Markdown для meta description
function cleanMarkdownForMeta(text) {
  if (!text) return '';
  return text
    .replace(/^#+\s+/gm, '') // Убираем заголовки
    .replace(/\*\*(.*?)\*\*/g, '$1') // Убираем жирный текст
    .replace(/\*(.*?)\*/g, '$1') // Убираем курсив
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Убираем ссылки
    .replace(/\n+/g, ' ') // Заменяем переносы на пробелы
    .trim()
    .substring(0, 160);
}

// Вставляем ссылку на проект в текст (для SEO) - заменяем упоминания названий ПРОЕКТОВ на ссылку
// Это будет сделано отдельно для ru и en версий после замены плейсхолдеров
// НЕ заменяем название дневника (config.projectName), только названия конкретных проектов
if (projectUrl && projectUrl.trim() !== '' && sortedStages && sortedStages.length > 0) {
  // Получаем список всех проектов из этапов
  const allProjectNames = [...new Set(sortedStages.map(s => s.projectName.replace(/_log$/, '')))];
  
  // Ищем название проекта только в текстовом контенте (не в тегах)
  const parts = template.split(/(<[^>]+>)/);
  for (let i = 0; i < parts.length; i++) {
    // Пропускаем HTML теги (особенно title, meta, head, и теги со ссылками)
    if (parts[i].startsWith('<')) {
      const tag = parts[i].toLowerCase();
      if (tag.includes('<title') || tag.includes('</title') || tag.includes('<meta') || tag.includes('<head') || tag.includes('</head') || tag.includes('<a ') || tag.includes('</a>') || tag.includes('<h1') || tag.includes('</h1>')) {
        continue;
      }
      continue;
    }
    
    // Пропускаем текст, который находится между тегами <a> и </a> (уже внутри ссылки)
    if (i > 0) {
      const prevTag = parts[i - 1].toLowerCase();
      if (prevTag.includes('<a ') && !prevTag.includes('</a>')) {
        let foundClosingA = false;
        for (let j = i + 1; j < parts.length && j < i + 10; j++) {
          if (parts[j].includes('</a>')) {
            foundClosingA = true;
            break;
          }
        }
        if (foundClosingA) {
          continue;
        }
      }
    }
    
    // Заменяем названия проектов на ссылку (но не название дневника)
    const text = parts[i];
    let newText = text;
    
    allProjectNames.forEach(projectName => {
      // Пропускаем, если это название дневника
      if (config.projectName.toLowerCase().includes(projectName.toLowerCase()) || projectName.toLowerCase().includes(config.projectName.toLowerCase())) {
        return;
      }
      
      const projectNameEscaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const projectNameRegex = new RegExp(`\\b(${projectNameEscaped})\\b(?![^<]*</a>)`, 'gi');
      newText = newText.replace(projectNameRegex, (match) => {
        return `<a href="${projectUrl}" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none; border-bottom: 1px solid #3498db;">${match}</a>`;
      });
    });
    
    parts[i] = newText;
  }
  template = parts.join('');
}

// Сохраняем дневник для обоих языков
console.log('📁 Создаю папки для вывода...');
const outputDir = path.join(__dirname, '../public');
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.join(outputDir, 'ru'), { recursive: true });
fs.mkdirSync(path.join(outputDir, 'en'), { recursive: true });
console.log(`✅ Создана папка: ${outputDir}`);

// Создаем папки для языков
const ruDir = path.join(outputDir, 'ru');
const enDir = path.join(outputDir, 'en');

// Генерируем русскую версию
console.log('📝 Генерирую русскую версию...');
let templateRu = fs.readFileSync(templatePath, 'utf-8');
templateRu = templateRu.replace(/<html lang="ru">/g, '<html lang="ru">');
templateRu = templateRu.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
templateRu = templateRu.replace(/\{\{PROJECT_DESCRIPTION\}\}/g, cleanMarkdownForMeta(projectDescription));
templateRu = templateRu.replace(/\{\{PROJECT_URL_META\}\}/g, projectUrlMeta);
templateRu = templateRu.replace(/\{\{PROJECT_DESCRIPTION_BLOCK\}\}/g, projectDescriptionBlock);
templateRu = templateRu.replace(/\{\{PROJECT_LINK_BLOCK\}\}/g, projectLinkBlock);
templateRu = templateRu.replace(/\{\{TABLE_OF_CONTENTS\}\}/g, tableOfContentsRu);
templateRu = templateRu.replace(/\{\{PROJECT_LINK_FOOTER\}\}/g, projectLinkFooter);
templateRu = templateRu.replace(/\{\{STAGES_CONTENT\}\}/g, stagesHTML);
templateRu = templateRu.replace(/\{\{GENERATION_DATE\}\}/g, new Date().toLocaleDateString('ru-RU'));
templateRu = templateRu.replace(/\{\{RU_ACTIVE\}\}/g, 'active');
templateRu = templateRu.replace(/\{\{EN_ACTIVE\}\}/g, '');
templateRu = templateRu.replace(/\{\{RU_URL\}\}/g, 'index.html');
templateRu = templateRu.replace(/\{\{EN_URL\}\}/g, '../en/index.html');
templateRu = templateRu.replace(/\{\{BACK_LINK\}\}/g, '');
templateRu = templateRu.replace(/\{\{SUBTITLE\}\}/g, 'Дневник разработки');

// Вставляем ссылку на проект в текст для русской версии
if (projectUrl && projectUrl.trim() !== '' && sortedStages && sortedStages.length > 0) {
  const allProjectNames = [...new Set(sortedStages.map(s => s.projectName.replace(/_log$/, '')))];
  const parts = templateRu.split(/(<[^>]+>)/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<')) {
      const tag = parts[i].toLowerCase();
      if (tag.includes('<title') || tag.includes('</title') || tag.includes('<meta') || tag.includes('<head') || tag.includes('</head') || tag.includes('<a ') || tag.includes('</a>') || tag.includes('<h1') || tag.includes('</h1>')) {
        continue;
      }
      continue;
    }
    if (i > 0) {
      const prevTag = parts[i - 1].toLowerCase();
      if (prevTag.includes('<a ') && !prevTag.includes('</a>')) {
        let foundClosingA = false;
        for (let j = i + 1; j < parts.length && j < i + 10; j++) {
          if (parts[j].includes('</a>')) {
            foundClosingA = true;
            break;
          }
        }
        if (foundClosingA) continue;
      }
    }
    const text = parts[i];
    let newText = text;
    allProjectNames.forEach(projectName => {
      if (config.projectName.toLowerCase().includes(projectName.toLowerCase()) || projectName.toLowerCase().includes(config.projectName.toLowerCase())) {
        return;
      }
      const projectNameEscaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const projectNameRegex = new RegExp(`\\b(${projectNameEscaped})\\b(?![^<]*</a>)`, 'gi');
      newText = newText.replace(projectNameRegex, (match) => {
        return `<a href="${projectUrl}" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none; border-bottom: 1px solid #3498db;">${match}</a>`;
      });
    });
    parts[i] = newText;
  }
  templateRu = parts.join('');
}

const outputPathRu = path.join(ruDir, 'index.html');
try {
  if (!templateRu) throw new Error('templateRu is undefined');
  if (!ruDir) throw new Error('ruDir is undefined');
  fs.writeFileSync(outputPathRu, templateRu, 'utf-8');
  console.log(`✅ Создан ru/index.html`);
} catch (error) {
  console.error('❌ Ошибка при создании ru/index.html:', error.message);
  console.error(error.stack);
}

// Генерируем английскую версию (пока используем русский контент, если нет английского)
let templateEn = fs.readFileSync(templatePath, 'utf-8');
templateEn = templateEn.replace(/<html lang="ru">/g, '<html lang="en">');
templateEn = templateEn.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
templateEn = templateEn.replace(/\{\{PROJECT_DESCRIPTION\}\}/g, cleanMarkdownForMeta(projectDescription));
templateEn = templateEn.replace(/\{\{PROJECT_URL_META\}\}/g, projectUrlMeta);
templateEn = templateEn.replace(/\{\{PROJECT_DESCRIPTION_BLOCK\}\}/g, projectDescriptionBlock);
templateEn = templateEn.replace(/\{\{PROJECT_LINK_BLOCK\}\}/g, projectLinkBlock);
templateEn = templateEn.replace(/\{\{TABLE_OF_CONTENTS\}\}/g, tableOfContentsEn);
templateEn = templateEn.replace(/\{\{PROJECT_LINK_FOOTER\}\}/g, projectLinkFooter);
templateEn = templateEn.replace(/\{\{STAGES_CONTENT\}\}/g, stagesHTML);
templateEn = templateEn.replace(/\{\{GENERATION_DATE\}\}/g, new Date().toLocaleDateString('en-US'));
templateEn = templateEn.replace(/\{\{RU_ACTIVE\}\}/g, '');
templateEn = templateEn.replace(/\{\{EN_ACTIVE\}\}/g, 'active');
templateEn = templateEn.replace(/\{\{RU_URL\}\}/g, '../ru/index.html');
templateEn = templateEn.replace(/\{\{EN_URL\}\}/g, 'index.html');
templateEn = templateEn.replace(/\{\{BACK_LINK\}\}/g, '');
templateEn = templateEn.replace(/\{\{SUBTITLE\}\}/g, 'Development Diary');

// Заменяем русские заголовки на английские в мета-тегах
templateEn = templateEn.replace(/<title>([^<]+) - Дневник разработки<\/title>/g, `<title>$1 - Development Diary</title>`);
templateEn = templateEn.replace(/content="([^"]*), разработка, дневник разработки/g, 'content="$1, development, development diary');

// Вставляем ссылку на проект в текст для английской версии
if (projectUrl && projectUrl.trim() !== '' && sortedStages && sortedStages.length > 0) {
  const allProjectNames = [...new Set(sortedStages.map(s => s.projectName.replace(/_log$/, '')))];
  const parts = templateEn.split(/(<[^>]+>)/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<')) {
      const tag = parts[i].toLowerCase();
      if (tag.includes('<title') || tag.includes('</title') || tag.includes('<meta') || tag.includes('<head') || tag.includes('</head') || tag.includes('<a ') || tag.includes('</a>') || tag.includes('<h1') || tag.includes('</h1>')) {
        continue;
      }
      continue;
    }
    if (i > 0) {
      const prevTag = parts[i - 1].toLowerCase();
      if (prevTag.includes('<a ') && !prevTag.includes('</a>')) {
        let foundClosingA = false;
        for (let j = i + 1; j < parts.length && j < i + 10; j++) {
          if (parts[j].includes('</a>')) {
            foundClosingA = true;
            break;
          }
        }
        if (foundClosingA) continue;
      }
    }
    const text = parts[i];
    let newText = text;
    allProjectNames.forEach(projectName => {
      if (config.projectName.toLowerCase().includes(projectName.toLowerCase()) || projectName.toLowerCase().includes(config.projectName.toLowerCase())) {
        return;
      }
      const projectNameEscaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const projectNameRegex = new RegExp(`\\b(${projectNameEscaped})\\b(?![^<]*</a>)`, 'gi');
      newText = newText.replace(projectNameRegex, (match) => {
        return `<a href="${projectUrl}" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none; border-bottom: 1px solid #3498db;">${match}</a>`;
      });
    });
    parts[i] = newText;
  }
  templateEn = parts.join('');
}

const outputPathEn = path.join(enDir, 'index.html');
try {
  if (!templateEn) throw new Error('templateEn is undefined');
  if (!enDir) throw new Error('enDir is undefined');
  fs.writeFileSync(outputPathEn, templateEn, 'utf-8');
  console.log(`✅ Создан en/index.html`);
} catch (error) {
  console.error('❌ Ошибка при создании en/index.html:', error.message);
  console.error(error.stack);
}

// Создаем главный index.html с редиректом на ru/
const mainIndex = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Redirecting...</title>
    <script>
        // Универсальный редирект, работает и локально (file://), и на хостинге
        (function() {
            const currentPath = window.location.pathname || window.location.href;
            // Если это file:// протокол, используем относительный путь
            if (window.location.protocol === 'file:') {
                window.location.href = 'ru/index.html';
            } else {
                // На хостинге используем относительный путь от текущей директории
                const pathParts = currentPath.split('/').filter(p => p);
                const lastPart = pathParts[pathParts.length - 1];
                // Если мы в корневой папке diary/, добавляем ru/
                if (lastPart === 'diary' || lastPart === '' || !lastPart) {
                    window.location.href = 'ru/index.html';
                } else {
                    // Иначе используем относительный путь
                    window.location.href = 'ru/index.html';
                }
            }
        })();
    </script>
    <meta http-equiv="refresh" content="0; url=ru/index.html">
</head>
<body>
    <p>Redirecting to <a href="ru/index.html">Russian version</a>...</p>
</body>
</html>`;
const mainIndexPath = path.join(outputDir, 'index.html');
try {
  if (!mainIndex) throw new Error('mainIndex is undefined');
  if (!outputDir) throw new Error('outputDir is undefined');
  fs.writeFileSync(mainIndexPath, mainIndex, 'utf-8');
  console.log(`✅ Создан главный index.html`);
} catch (error) {
  console.error('❌ Ошибка при создании главного index.html:', error.message);
  console.error(error.stack);
}

console.log(`\n✅ Дневник сгенерирован!`);
console.log(`📁 Файлы сохранены:`);
console.log(`   - public/index.html (редирект)`);
console.log(`   - public/ru/index.html`);
console.log(`   - public/en/index.html`);
console.log(`📊 Всего этапов: ${sortedStages.length}`);

// Генерируем отдельные страницы для каждого проекта
console.log('\n📄 Генерируем отдельные страницы для проектов...\n');

projects.forEach(project => {
  // Получаем этапы только этого проекта
  const projectStages = sortedStages.filter(s => s.projectName === project.name);
  
  if (projectStages.length === 0) {
    return;
  }
  
  // Получаем описание и ссылку для этого проекта
  let projectDescription = '';
  let projectUrl = config.projectUrl || '';
  
  // Проверяем intro.md в корне проекта или в stages/
  let introPath = path.join(project.dir, 'intro.md');
  if (!fs.existsSync(introPath)) {
    introPath = path.join(project.dir, 'stages', 'intro.md');
  }
  if (fs.existsSync(introPath)) {
    projectDescription = fs.readFileSync(introPath, 'utf-8').trim();
  }
  
  const projectUrlPath = path.join(project.dir, 'project-url.txt');
  if (fs.existsSync(projectUrlPath)) {
    projectUrl = fs.readFileSync(projectUrlPath, 'utf-8').trim();
  }
  
  // Генерируем контент для этапов проекта (используем ту же логику, что и для основного дневника)
  // Для упрощения, используем уже сгенерированный HTML из основного дневника
  // Но лучше перегенерировать для каждого проекта отдельно
  
  // Функция для генерации описания проекта (для одного языка)
  const generateProjectDescriptionBlock = (lang) => {
    const isEn = lang === 'en';
    let descriptionBlock = '';
    
    // Проверяем наличие английской версии intro
    let description = projectDescription;
    if (isEn) {
      // Сначала проверяем en/intro.md (новая структура) в корне проекта
      let introEnPath = path.join(project.dir, 'en', 'intro.md');
      if (fs.existsSync(introEnPath)) {
        description = fs.readFileSync(introEnPath, 'utf-8').trim();
      } else {
        // Проверяем stages/en/intro.md (новая структура в папке stages)
        introEnPath = path.join(project.dir, 'stages', 'en', 'intro.md');
        if (fs.existsSync(introEnPath)) {
          description = fs.readFileSync(introEnPath, 'utf-8').trim();
        } else {
          // Проверяем intro.en.md (старая структура для обратной совместимости)
          const introEnPathOld = path.join(project.dir, 'intro.en.md');
          if (fs.existsSync(introEnPathOld)) {
            description = fs.readFileSync(introEnPathOld, 'utf-8').trim();
          }
        }
      }
    }
    
    if (description) {
      const descriptionHtml = markdownToHtml(description);
      const descriptionText = description.replace(/[#*\[\]()]/g, '').trim();
      const isLong = descriptionText.length > 500;
      
      const title = isEn ? 'About the project' : 'О проекте';
      descriptionBlock = '<div class="stage-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 40px;">';
      descriptionBlock += `<h3 style="margin-top: 0;">${title}</h3>`;
      
      if (isLong) {
        const uniqueId = `project-description-${project.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const shortText = descriptionText.substring(0, 500);
        const lastSpace = shortText.lastIndexOf(' ');
        const cutoffPoint = lastSpace > 400 ? lastSpace : 500;
        
        let shortHtml = descriptionHtml;
        if (descriptionHtml.length > cutoffPoint * 2) {
          const htmlCutoff = Math.min(cutoffPoint * 2, descriptionHtml.length * 0.6);
          const lastTag = descriptionHtml.lastIndexOf('</p>', htmlCutoff);
          if (lastTag > 0) {
            shortHtml = descriptionHtml.substring(0, lastTag + 4);
          } else {
            shortHtml = descriptionHtml.substring(0, htmlCutoff) + '...';
          }
        }
        
        const readMoreText = isEn ? 'Read more' : 'Читать далее';
        const collapseText = isEn ? 'Collapse' : 'Свернуть';
        
        descriptionBlock += `<div id="${uniqueId}-short" style="display: block;">`;
        descriptionBlock += shortHtml;
        descriptionBlock += ` <a href="#" onclick="document.getElementById('${uniqueId}-short').style.display='none'; document.getElementById('${uniqueId}-full').style.display='block'; return false;" style="color: #3498db; text-decoration: none; border-bottom: 1px solid #3498db;">${readMoreText}</a>`;
        descriptionBlock += '</div>';
        descriptionBlock += `<div id="${uniqueId}-full" style="display: none;">`;
        descriptionBlock += descriptionHtml;
        descriptionBlock += ` <a href="#" onclick="document.getElementById('${uniqueId}-full').style.display='none'; document.getElementById('${uniqueId}-short').style.display='block'; return false;" style="color: #3498db; text-decoration: none; border-bottom: 1px solid #3498db;">${collapseText}</a>`;
        descriptionBlock += '</div>';
      } else {
        descriptionBlock += descriptionHtml;
      }
      
      descriptionBlock += '</div>';
    }
    
    return descriptionBlock;
  };
  
  // Формируем описание проекта для обоих языков
  const projectDescriptionBlockRu = generateProjectDescriptionBlock('ru');
  const projectDescriptionBlockEn = generateProjectDescriptionBlock('en');
  
  // Формируем ссылку на проект
  const generateProjectLinkBlock = (lang) => {
    const isEn = lang === 'en';
    if (!projectUrl || projectUrl.trim() === '') return '';
    const text = isEn ? 'Current implementation at:' : 'Текущая реализация на:';
    return `<p>${text} <a href="${projectUrl}" target="_blank" rel="noopener noreferrer">${projectUrl}</a></p>`;
  };
  
  const generateProjectLinkFooter = (lang) => {
    const isEn = lang === 'en';
    if (!projectUrl || projectUrl.trim() === '') return '';
    const text = isEn ? 'Working version available at:' : 'Рабочая версия проекта доступна по адресу:';
    return `<p style="margin-top: 20px;">${text} <a href="${projectUrl}" target="_blank" rel="noopener noreferrer">${projectUrl}</a></p>`;
  };
  
  // Сортируем этапы проекта по дате
  const sortedProjectStages = [...projectStages].sort((a, b) => {
    return new Date(a.date) - new Date(b.date);
  });
  
  // Фильтруем только существующие этапы для правильной индексации
  const existingStagesForTOC = sortedProjectStages.filter(stageMeta => fs.existsSync(stageMeta.stageFilePath));
  
  // Функция для генерации оглавления (для одного языка)
  const generateTableOfContents = (lang) => {
    const isEn = lang === 'en';
    if (existingStagesForTOC.length <= 1) return '';
    
    let toc = '<div class="stage-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 40px;">';
    toc += `<h3 style="margin-top: 0;">${isEn ? 'Table of Contents' : 'Оглавление'}</h3>`;
    toc += '<ul style="list-style: none; padding-left: 0;">';
    
    existingStagesForTOC.forEach((stageMeta, index) => {
      const stageId = `stage-${index}`;
      // Для английской версии пытаемся найти английский заголовок
      let stageTitle = stageMeta.title;
      if (isEn) {
        // Ищем файл в папке en/ (новая структура)
        const stagesDir = path.dirname(stageMeta.stageFilePath);
        const fileName = path.basename(stageMeta.stageFilePath);
        const enStageFilePath = path.join(stagesDir, 'en', fileName);
        // Если нет в папке en/, пробуем старый формат .en.md (обратная совместимость)
        const enStageFilePathOld = stageMeta.stageFilePath.replace(/\.md$/, '.en.md');
        const finalEnPath = fs.existsSync(enStageFilePath) ? enStageFilePath : (fs.existsSync(enStageFilePathOld) ? enStageFilePathOld : null);
        
        if (finalEnPath) {
          const enStageContent = extractStageContent(finalEnPath);
          if (enStageContent.title) {
            stageTitle = enStageContent.title;
          }
        }
      }
      if (!stageTitle) {
        stageTitle = isEn ? `Stage ${index + 1}` : `Этап ${index + 1}`;
      }
      
      toc += `<li style="margin-bottom: 10px;">`;
      toc += `<a href="#${stageId}" style="color: #2c3e50; text-decoration: none; border-bottom: 1px solid #3498db; padding-bottom: 2px;">${stageTitle}</a>`;
      toc += `</li>`;
    });
    
    toc += '</ul>';
    toc += '</div>';
    return toc;
  };
  
  const projectTableOfContentsRu = generateTableOfContents('ru');
  const projectTableOfContentsEn = generateTableOfContents('en');
  
  // Функция для генерации HTML этапов для одного языка
  const generateStagesHTML = (lang) => {
    let stagesHTML = '';
    const isEn = lang === 'en';
    
      // Функция для обработки скриншотов - используем обычные пути вместо base64
      const processScreenshot = (fileName, alt) => {
        // Относительный путь к скриншоту от текущей страницы
        // Если мы в ru/lofiradio/index.html, то screenshots/file.png (скриншоты в папке проекта)
        const screenshotRelPath = `screenshots/${fileName}`;
        const escapedAlt = (alt || fileName).replace(/"/g, '&quot;');
        
        let imageHTML = '<div class="screenshot" style="margin: 20px 0;">';
        imageHTML += `<img src="${screenshotRelPath}" alt="${escapedAlt}" style="max-width: 100%; width: auto; height: auto; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: block;">`;
        if (alt) {
          imageHTML += `<div class="screenshot-caption">${alt}</div>`;
        }
        imageHTML += '</div>';
        
        return imageHTML;
      };
    
    existingStagesForTOC.forEach((stageMeta, index) => {
      // Выбираем файл этапа в зависимости от языка
      let stageFilePath = stageMeta.stageFilePath;
      if (isEn) {
        // Ищем файл в папке en/ (новая структура)
        const stagesDir = path.dirname(stageMeta.stageFilePath);
        const fileName = path.basename(stageMeta.stageFilePath);
        const enStageFilePath = path.join(stagesDir, 'en', fileName);
        
        // Если нет в папке en/, пробуем старый формат .en.md (обратная совместимость)
        const enStageFilePathOld = stageMeta.stageFilePath.replace(/\.md$/, '.en.md');
        
        if (fs.existsSync(enStageFilePath)) {
          stageFilePath = enStageFilePath;
        } else if (fs.existsSync(enStageFilePathOld)) {
          stageFilePath = enStageFilePathOld;
        }
        // Если английской версии нет, используем русскую
      }
      
      const stageContent = extractStageContent(stageFilePath);
      // Для английской версии используем заголовок из английского файла, если есть
      let stageTitle = stageMeta.title || stageContent.title;
      if (isEn && stageFilePath !== stageMeta.stageFilePath && stageContent.title) {
        stageTitle = stageContent.title;
      }
      const stageId = `stage-${index}`;
      
      let stageHTML = `<div class="stage" id="${stageId}">`;
      stageHTML += '<div class="stage-header">';
      stageHTML += `<div class="stage-date">${stageMeta.date}</div>`;
      
      // Добавляем ссылку на предыдущий этап
      if (index > 0) {
        const prevStage = existingStagesForTOC[index - 1];
        const prevStageId = `stage-${index - 1}`;
        // Для английской версии пытаемся найти английский заголовок предыдущего этапа
        let prevStageTitle = prevStage.title;
        if (isEn) {
          const prevStagesDir = path.dirname(prevStage.stageFilePath);
          const prevFileName = path.basename(prevStage.stageFilePath);
          const prevEnStageFilePath = path.join(prevStagesDir, 'en', prevFileName);
          const prevEnStageFilePathOld = prevStage.stageFilePath.replace(/\.md$/, '.en.md');
          const finalPrevEnPath = fs.existsSync(prevEnStageFilePath) ? prevEnStageFilePath : (fs.existsSync(prevEnStageFilePathOld) ? prevEnStageFilePathOld : null);
          
          if (finalPrevEnPath) {
            const prevEnStageContent = extractStageContent(finalPrevEnPath);
            if (prevEnStageContent.title) {
              prevStageTitle = prevEnStageContent.title;
            }
          }
        }
        if (!prevStageTitle) {
          prevStageTitle = isEn ? `Stage ${index}` : `Этап ${index}`;
        }
        const prevText = isEn ? '← Previous stage:' : '← Предыдущий этап:';
        stageHTML += `<div style="margin-bottom: 10px; font-size: 0.9em;"><a href="#${prevStageId}" style="color: #3498db; text-decoration: none; border-bottom: 1px solid #3498db;">${prevText} ${prevStageTitle}</a></div>`;
      }
      
      console.log(`    📄 ${index + 1}. ${stageTitle} (${stageMeta.date})${isEn && stageFilePath !== stageMeta.stageFilePath ? ' [EN]' : ''}`);
      
      stageHTML += `<h2 class="stage-title">${stageTitle}</h2>`;
      stageHTML += '</div>';
      
      // Функция для генерации секции
      const addSection = (ruTitle, enTitle, content) => {
        if (!content) return '';
        let sectionHTML = '<div class="stage-section">';
        sectionHTML += `<h3>${isEn ? enTitle : ruTitle}</h3>`;
        sectionHTML += markdownToHtml(content, processScreenshot);
        sectionHTML += '</div>';
        return sectionHTML;
      };
      
      // Добавляем секции этапа
      stageHTML += addSection('Что было', 'What was needed', stageContent.whatWas);
      stageHTML += addSection('Решение', 'Solution', stageContent.solution);
      stageHTML += addSection('Почему такое решение', 'Why this solution', stageContent.whySolution);
      stageHTML += addSection('Плюсы', 'Pros', stageContent.pros);
      stageHTML += addSection('Минусы', 'Cons', stageContent.cons);
      stageHTML += addSection('Подводные камни', 'Gotchas', stageContent.gotchas);
      
      // Что сделано
      if (stageContent.whatDone && stageContent.whatDone.length > 0) {
        stageHTML += '<div class="stage-section">';
        stageHTML += `<h3>${isEn ? 'What was done' : 'Что сделано'}</h3>`;
        stageHTML += '<ul class="what-done-list">';
        stageContent.whatDone.forEach(item => {
          stageHTML += `<li>${processInlineMarkdown(item)}</li>`;
        });
        stageHTML += '</ul>';
        stageHTML += '</div>';
      }
      
      // Обрабатываем скриншоты вне секций
      const fullContent = fs.readFileSync(stageFilePath, 'utf-8');
      const screenshotRegex = /!\[(.*?)\]\((.*?)\)/g;
      const foundScreenshots = [];
      let match;
      
      screenshotRegex.lastIndex = 0;
      while ((match = screenshotRegex.exec(fullContent)) !== null) {
        const alt = match[1];
        const imagePath = match[2];
        const screenshotLang = isEn ? 'en' : 'ru';
        if (imagePath.includes(`screenshots/${screenshotLang}/`)) {
          const fileName = imagePath.split('/').pop();
          foundScreenshots.push({ fileName, alt });
        }
      }
      
      const allSectionContent = [
        stageContent.whatWas || '',
        stageContent.solution || '',
        stageContent.whySolution || '',
        stageContent.pros || '',
        stageContent.cons || '',
        stageContent.gotchas || ''
      ].join('\n');
      
      const processedScreenshotsInSections = new Set();
      screenshotRegex.lastIndex = 0;
      while ((match = screenshotRegex.exec(allSectionContent)) !== null) {
        const imagePath = match[2];
        const screenshotLang = isEn ? 'en' : 'ru';
        if (imagePath.includes(`screenshots/${screenshotLang}/`)) {
          const fileName = imagePath.split('/').pop();
          processedScreenshotsInSections.add(fileName);
        }
      }
      
      const unprocessedScreenshots = foundScreenshots.filter(s => !processedScreenshotsInSections.has(s.fileName));
      
      if (unprocessedScreenshots.length > 0) {
        stageHTML += '<div class="stage-section">';
        stageHTML += '<div class="screenshots">';
        
        unprocessedScreenshots.forEach(({ fileName, alt }) => {
          const imageHtml = processScreenshot(fileName, alt);
          if (imageHtml) {
            stageHTML += imageHtml;
          }
        });
        
        stageHTML += '</div>';
        stageHTML += '</div>';
      }
      
      stageHTML += '</div>';
      stagesHTML += stageHTML;
    });
    
    return stagesHTML;
  };
  
  // Генерируем HTML для этапов проекта отдельно для каждого языка
  const projectStagesHTMLRu = generateStagesHTML('ru');
  const projectStagesHTMLEn = generateStagesHTML('en');
  
  // Генерируем страницы проекта для обоих языков
  const projectDisplayName = project.name.replace(/_log$/, '');
  
  // Русская версия проекта
  let projectTemplateRu = fs.readFileSync(templatePath, 'utf-8');
  projectTemplateRu = projectTemplateRu.replace(/<html lang="ru">/g, '<html lang="ru">');
  projectTemplateRu = projectTemplateRu.replace(/\{\{PROJECT_NAME\}\}/g, projectDisplayName);
  projectTemplateRu = projectTemplateRu.replace(/\{\{PROJECT_DESCRIPTION\}\}/g, cleanMarkdownForMeta(projectDescription));
  projectTemplateRu = projectTemplateRu.replace(/\{\{PROJECT_URL_META\}\}/g, projectUrl && projectUrl.trim() !== '' ? `<link rel="canonical" href="${projectUrl}">\n    <meta property="og:url" content="${projectUrl}">\n    <meta name="twitter:url" content="${projectUrl}">` : '');
  projectTemplateRu = projectTemplateRu.replace(/\{\{PROJECT_DESCRIPTION_BLOCK\}\}/g, projectDescriptionBlockRu);
  projectTemplateRu = projectTemplateRu.replace(/\{\{PROJECT_LINK_BLOCK\}\}/g, generateProjectLinkBlock('ru'));
  projectTemplateRu = projectTemplateRu.replace(/\{\{TABLE_OF_CONTENTS\}\}/g, projectTableOfContentsRu);
  projectTemplateRu = projectTemplateRu.replace(/\{\{PROJECT_LINK_FOOTER\}\}/g, generateProjectLinkFooter('ru'));
  projectTemplateRu = projectTemplateRu.replace(/\{\{STAGES_CONTENT\}\}/g, projectStagesHTMLRu);
  // Убираем footer для проектов - заменяем на ссылку "Другие проекты"
  projectTemplateRu = projectTemplateRu.replace(/<footer>[\s\S]*?<\/footer>/g, '<footer><p><a href="../index.html" style="color: #3498db; text-decoration: none; border-bottom: 1px solid #3498db;">← Другие проекты</a></p></footer>');
  projectTemplateRu = projectTemplateRu.replace(/\{\{GENERATION_DATE\}\}/g, '');
  projectTemplateRu = projectTemplateRu.replace(/\{\{RU_ACTIVE\}\}/g, 'active');
  projectTemplateRu = projectTemplateRu.replace(/\{\{EN_ACTIVE\}\}/g, '');
  projectTemplateRu = projectTemplateRu.replace(/\{\{SUBTITLE\}\}/g, 'Дневник разработки');
  
  // Добавляем ссылку на главную страницу (проекты теперь внутри языковых папок)
  const backLinkRu = '<div class="back-link"><a href="../index.html">← Другие проекты</a></div>';
  projectTemplateRu = projectTemplateRu.replace(/\{\{BACK_LINK\}\}/g, backLinkRu);
  
  // Обновляем пути переключения языков (проекты внутри языковых папок)
  projectTemplateRu = projectTemplateRu.replace(/\{\{RU_URL\}\}/g, 'index.html');
  projectTemplateRu = projectTemplateRu.replace(/\{\{EN_URL\}\}/g, `../../en/${projectDisplayName}/index.html`);
  
  // Английская версия проекта - генерируем отдельно с английским контентом
  let projectTemplateEn = fs.readFileSync(templatePath, 'utf-8');
  projectTemplateEn = projectTemplateEn.replace(/<html lang="ru">/g, '<html lang="en">');
  projectTemplateEn = projectTemplateEn.replace(/\{\{PROJECT_NAME\}\}/g, projectDisplayName);
  
  // Для английской версии используем английское описание, если есть
  let projectDescriptionEn = projectDescription;
  const introEnPath = path.join(project.dir, 'intro.en.md');
  if (fs.existsSync(introEnPath)) {
    projectDescriptionEn = fs.readFileSync(introEnPath, 'utf-8').trim();
  }
  
  projectTemplateEn = projectTemplateEn.replace(/\{\{PROJECT_DESCRIPTION\}\}/g, cleanMarkdownForMeta(projectDescriptionEn));
  projectTemplateEn = projectTemplateEn.replace(/\{\{PROJECT_URL_META\}\}/g, projectUrl && projectUrl.trim() !== '' ? `<link rel="canonical" href="${projectUrl}">\n    <meta property="og:url" content="${projectUrl}">\n    <meta name="twitter:url" content="${projectUrl}">` : '');
  projectTemplateEn = projectTemplateEn.replace(/\{\{PROJECT_DESCRIPTION_BLOCK\}\}/g, projectDescriptionBlockEn);
  projectTemplateEn = projectTemplateEn.replace(/\{\{PROJECT_LINK_BLOCK\}\}/g, generateProjectLinkBlock('en'));
  projectTemplateEn = projectTemplateEn.replace(/\{\{TABLE_OF_CONTENTS\}\}/g, projectTableOfContentsEn);
  projectTemplateEn = projectTemplateEn.replace(/\{\{PROJECT_LINK_FOOTER\}\}/g, generateProjectLinkFooter('en'));
  projectTemplateEn = projectTemplateEn.replace(/\{\{STAGES_CONTENT\}\}/g, projectStagesHTMLEn);
  // Убираем footer для проектов - заменяем на ссылку "Other projects"
  projectTemplateEn = projectTemplateEn.replace(/<footer>[\s\S]*?<\/footer>/g, '<footer><p><a href="../index.html" style="color: #3498db; text-decoration: none; border-bottom: 1px solid #3498db;">← Other projects</a></p></footer>');
  projectTemplateEn = projectTemplateEn.replace(/\{\{GENERATION_DATE\}\}/g, '');
  projectTemplateEn = projectTemplateEn.replace(/\{\{RU_ACTIVE\}\}/g, '');
  projectTemplateEn = projectTemplateEn.replace(/\{\{EN_ACTIVE\}\}/g, 'active');
  projectTemplateEn = projectTemplateEn.replace(/\{\{SUBTITLE\}\}/g, 'Development Diary');
  
  // Заменяем русские заголовки на английские в мета-тегах
  projectTemplateEn = projectTemplateEn.replace(/<title>([^<]+) - Дневник разработки<\/title>/g, `<title>$1 - Development Diary</title>`);
  projectTemplateEn = projectTemplateEn.replace(/content="([^"]*), разработка, дневник разработки/g, 'content="$1, development, development diary');
  
  // Добавляем ссылку на главную страницу (проекты теперь внутри языковых папок)
  const backLinkEn = '<div class="back-link"><a href="../index.html">← Other projects</a></div>';
  projectTemplateEn = projectTemplateEn.replace(/\{\{BACK_LINK\}\}/g, backLinkEn);
  
  // Обновляем пути переключения языков (проекты внутри языковых папок)
  projectTemplateEn = projectTemplateEn.replace(/\{\{RU_URL\}\}/g, `../../ru/${projectDisplayName}/index.html`);
  projectTemplateEn = projectTemplateEn.replace(/\{\{EN_URL\}\}/g, 'index.html');
  
  // Создаем папки для проекта внутри языковых папок
  const projectRuDir = path.join(ruDir, projectDisplayName);
  const projectEnDir = path.join(enDir, projectDisplayName);
  
  if (!fs.existsSync(projectRuDir)) fs.mkdirSync(projectRuDir, { recursive: true });
  if (!fs.existsSync(projectEnDir)) fs.mkdirSync(projectEnDir, { recursive: true });
  
  // Копируем скриншоты в папки проектов внутри языковых папок
  const projectScreenshotsRuDir = path.join(projectRuDir, 'screenshots');
  const projectScreenshotsEnDir = path.join(projectEnDir, 'screenshots');
  
  // Копируем скриншоты для русской версии проекта
  if (fs.existsSync(project.screenshotsDir.ru)) {
    if (!fs.existsSync(projectScreenshotsRuDir)) fs.mkdirSync(projectScreenshotsRuDir, { recursive: true });
    const ruFiles = fs.readdirSync(project.screenshotsDir.ru);
    ruFiles.forEach(file => {
      if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
        const srcPath = path.join(project.screenshotsDir.ru, file);
        const destPath = path.join(projectScreenshotsRuDir, file);
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }
  
  // Копируем скриншоты для английской версии проекта
  if (fs.existsSync(project.screenshotsDir.en)) {
    if (!fs.existsSync(projectScreenshotsEnDir)) fs.mkdirSync(projectScreenshotsEnDir, { recursive: true });
    const enFiles = fs.readdirSync(project.screenshotsDir.en);
    enFiles.forEach(file => {
      if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
        const srcPath = path.join(project.screenshotsDir.en, file);
        const destPath = path.join(projectScreenshotsEnDir, file);
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }
  
  
  // Сохраняем страницы проекта для обоих языков (внутри языковых папок)
  const projectOutputPathRu = path.join(projectRuDir, 'index.html');
  const projectOutputPathEn = path.join(projectEnDir, 'index.html');
  fs.writeFileSync(projectOutputPathRu, projectTemplateRu, 'utf-8');
  fs.writeFileSync(projectOutputPathEn, projectTemplateEn, 'utf-8');
  
  console.log(`  ✅ ${projectDisplayName}/ (${projectStages.length} этапов)`);
  console.log(`     - ru/${projectDisplayName}/index.html`);
  console.log(`     - en/${projectDisplayName}/index.html`);
});

console.log('\n✅ Генерация завершена!');
