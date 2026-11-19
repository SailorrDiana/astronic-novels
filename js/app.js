'use strict';

(() => {
  const root = document.getElementById('astronic-app');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const $ = (id) => document.getElementById(id);
  const GROUP_NAMES = ['Esquerda', 'Centro', 'Direita'];
  const DB_NAME = 'AstronicNovelsLocal';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';

  const createEmptyScene = () => ({
    bg: null,
    bgName: '',
    groups: [[], [], []],
    speaker: '',
    text: '',
    font: 'Georgia,serif',
    fontSize: 19,
    textColor: '#332b42',
    nameColor: '#7658a4',
    opacity: 94
  });

  const makeId = () => `astronic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  let scenes = [createEmptyScene()];
  let currentSceneIndex = 0;
  let activeProjectId = null;
  let projectName = 'Nenhum projeto aberto';
  let globalZoom = 100;
  let globalHeight = 0;
  let readerSceneIndex = 0;
  let databasePromise = null;
  let isDirty = false;
  let toastTimer = null;

  const currentScene = () => scenes[currentSceneIndex];

  function toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { element.hidden = true; }, 2800);
  }

  function setSaveState(message) {
    $('save-state').textContent = message;
  }

  function markDirty() {
    if (!activeProjectId) return;
    isDirty = true;
    setSaveState('Alterações não salvas');
  }

  function updateProjectNameDisplay() {
    $('project-name').textContent = projectName;
    $('project-name').title = projectName;
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ src: reader.result, name: file.name });
      reader.onerror = () => reject(reader.error || new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(file);
    });
  }

  function captureCurrentSceneFields() {
    const scene = currentScene();
    scene.speaker = $('speaker-input').value;
    scene.text = $('dialogue-input').value;
    scene.font = $('font-select').value;
    scene.fontSize = Math.max(10, Math.min(30, Number($('font-size').value) || 19));
    scene.textColor = $('text-color').value;
    scene.nameColor = $('name-color').value;
    scene.opacity = Number($('box-opacity').value);
  }

  function applySpriteTransform(image) {
    image.style.transform = `translateY(${-globalHeight}%) scale(${globalZoom / 100})`;
  }

  function renderPeople(host, scene, reader = false) {
    host.replaceChildren();
    GROUP_NAMES.forEach((_, groupIndex) => {
      const area = document.createElement('div');
      area.className = reader ? 'an-reader-area' : 'an-sprite-area';
      scene.groups[groupIndex].forEach((person) => {
        const wrapper = document.createElement('div');
        wrapper.className = reader ? 'an-reader-person' : 'an-sprite-person';
        const image = document.createElement('img');
        image.src = person.src;
        image.alt = person.name || 'Personagem';
        applySpriteTransform(image);
        wrapper.appendChild(image);
        area.appendChild(wrapper);
      });
      host.appendChild(area);
    });
  }

  function renderCharacterGroups() {
    const scene = currentScene();
    const host = $('character-groups');
    host.replaceChildren();

    GROUP_NAMES.forEach((groupName, groupIndex) => {
      const card = document.createElement('div');
      card.className = 'an-group-card';

      const title = document.createElement('div');
      title.className = 'an-group-title';
      title.append(document.createTextNode(groupName));
      const count = document.createElement('span');
      count.className = 'an-group-count';
      count.textContent = `${scene.groups[groupIndex].length} personagem(ns)`;
      title.appendChild(count);

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.hidden = true;
      input.id = `group-upload-${groupIndex}`;

      const uploadLabel = document.createElement('label');
      uploadLabel.className = 'an-file-label';
      uploadLabel.htmlFor = input.id;
      uploadLabel.textContent = '＋ Adicionar imagem';

      const people = document.createElement('div');
      people.className = 'an-group-people';

      scene.groups[groupIndex].forEach((person, personIndex) => {
        const row = document.createElement('div');
        row.className = 'an-person-row';
        const name = document.createElement('span');
        name.textContent = person.name || `Personagem ${personIndex + 1}`;
        name.title = person.name || '';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = 'Remover personagem';
        remove.setAttribute('aria-label', `Remover ${name.textContent}`);
        remove.addEventListener('click', () => {
          scene.groups[groupIndex].splice(personIndex, 1);
          markDirty();
          loadCurrentScene();
        });
        row.append(name, remove);
        people.appendChild(row);
      });

      input.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        try {
          const loadedImages = await Promise.all(files.map(readImageFile));
          scene.groups[groupIndex].push(...loadedImages);
          markDirty();
          loadCurrentScene();
          toast(`${loadedImages.length} imagem(ns) adicionada(s) em ${groupName.toLowerCase()}.`);
        } catch (error) {
          toast(error.message || 'Não foi possível carregar uma das imagens.');
        }
        event.target.value = '';
      });

      card.append(title, input, uploadLabel, people);
      host.appendChild(card);
    });

    $('global-zoom').value = globalZoom;
    $('global-height').value = globalHeight;
    $('zoom-value').textContent = `${globalZoom}%`;
    $('height-value').textContent = `${globalHeight > 0 ? '+' : ''}${globalHeight}%`;
  }

  function renderDialoguePreview() {
    const scene = currentScene();
    $('speaker-preview').textContent = scene.speaker || 'Nome do personagem';
    $('dialogue-preview-text').textContent = scene.text || 'Seu diálogo aparecerá aqui...';
    $('dialogue-preview-text').style.fontFamily = scene.font;
    $('dialogue-preview-text').style.fontSize = `clamp(11px, ${Math.max(1, scene.fontSize / 12)}vw, ${scene.fontSize}px)`;
    $('dialogue-preview-text').style.color = scene.textColor;
    $('speaker-preview').style.backgroundColor = scene.nameColor;
    $('dialogue-preview').style.backgroundColor = `rgba(250,247,255,${scene.opacity / 100})`;
  }

  function renderSceneList() {
    const host = $('scene-list');
    host.replaceChildren();
    scenes.forEach((scene, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `an-scene-card${index === currentSceneIndex ? ' active' : ''}`;
      const title = document.createElement('b');
      title.textContent = `Cena ${String(index + 1).padStart(2, '0')}`;
      const summary = document.createElement('small');
      summary.textContent = scene.text || 'Sem diálogo ainda';
      button.append(title, summary);
      button.addEventListener('click', () => {
        captureCurrentSceneFields();
        currentSceneIndex = index;
        loadCurrentScene();
      });
      host.appendChild(button);
    });
  }

  function loadCurrentScene() {
    const scene = currentScene();
    const background = $('stage-background');
    background.hidden = !scene.bg;
    background.src = scene.bg || '';
    $('stage-placeholder').hidden = Boolean(scene.bg);
    $('background-file-name').textContent = scene.bgName || 'Nenhuma imagem';

    renderPeople($('stage-sprites'), scene);
    renderCharacterGroups();

    $('speaker-input').value = scene.speaker;
    $('dialogue-input').value = scene.text;
    $('font-select').value = scene.font;
    $('font-size').value = scene.fontSize;
    $('text-color').value = scene.textColor;
    $('name-color').value = scene.nameColor;
    $('box-opacity').value = scene.opacity;
    $('opacity-value').textContent = `${scene.opacity}%`;

    renderDialoguePreview();
    renderSceneList();
    $('scene-counter').textContent = `Cena ${currentSceneIndex + 1} / ${scenes.length}`;
    updateProjectNameDisplay();
  }

  function updateDialogueFromInputs() {
    captureCurrentSceneFields();
    renderDialoguePreview();
    renderSceneList();
    $('opacity-value').textContent = `${$('box-opacity').value}%`;
    markDirty();
  }

  ['speaker-input', 'dialogue-input', 'font-select', 'font-size', 'text-color', 'name-color', 'box-opacity'].forEach((id) => {
    $(id).addEventListener('input', updateDialogueFromInputs);
    $(id).addEventListener('change', updateDialogueFromInputs);
  });

  $('global-zoom').addEventListener('input', (event) => {
    globalZoom = Number(event.target.value);
    $('zoom-value').textContent = `${globalZoom}%`;
    renderPeople($('stage-sprites'), currentScene());
    if (!$('reader').hidden) renderReaderScene();
    markDirty();
  });

  $('global-height').addEventListener('input', (event) => {
    globalHeight = Number(event.target.value);
    $('height-value').textContent = `${globalHeight > 0 ? '+' : ''}${globalHeight}%`;
    renderPeople($('stage-sprites'), currentScene());
    if (!$('reader').hidden) renderReaderScene();
    markDirty();
  });

  $('background-upload').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const image = await readImageFile(file);
      currentScene().bg = image.src;
      currentScene().bgName = image.name;
      markDirty();
      loadCurrentScene();
    } catch (error) {
      toast(error.message || 'Não foi possível carregar o cenário.');
    }
    event.target.value = '';
  });

  /* Local project persistence. Uploaded images are stored as data URLs inside each scene record. */
  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Este navegador não oferece armazenamento local IndexedDB.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Falha ao abrir o armazenamento local.'));
    });
    return databasePromise;
  }

  async function saveProjectRecord(record) {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Falha ao salvar o projeto.'));
      transaction.onabort = () => reject(transaction.error || new Error('O salvamento foi cancelado.'));
    });
  }

  async function getSavedProjectRecords() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('Não foi possível listar os projetos.'));
    });
  }

  async function removeSavedProjectRecord(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível excluir o projeto.'));
    });
  }

  function makeProjectRecord() {
    captureCurrentSceneFields();
    return {
      id: activeProjectId,
      name: projectName,
      updatedAt: Date.now(),
      globalZoom,
      globalHeight,
      scenes: structuredClone(scenes)
    };
  }

  async function saveCurrentProject() {
    if (!activeProjectId) {
      openNewProjectModal();
      toast('Crie um projeto e escolha um nome antes de salvar.');
      return;
    }
    const saveButton = root.querySelector('[data-action="save-project"]');
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';
    try {
      await saveProjectRecord(makeProjectRecord());
      isDirty = false;
      setSaveState('Salvo neste navegador');
      toast(`Projeto “${projectName}” salvo com todas as cenas e imagens.`);
    } catch (error) {
      toast(error.message || 'Não foi possível salvar o projeto.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Salvar projeto';
    }
  }

  function openNewProjectModal() {
    $('new-project-modal').hidden = false;
    $('new-project-name').value = '';
    $('new-project-name').focus();
  }

  async function createProject(name) {
    const cleanName = name.trim();
    if (!cleanName) {
      toast('Digite um nome para o projeto.');
      $('new-project-name').focus();
      return;
    }
    activeProjectId = makeId();
    projectName = cleanName;
    scenes = [createEmptyScene()];
    currentSceneIndex = 0;
    globalZoom = 100;
    globalHeight = 0;
    isDirty = true;
    $('new-project-modal').hidden = true;
    loadCurrentScene();
    await saveCurrentProject();
    toast(`Projeto “${projectName}” criado.`);
  }

  async function openSavedProjectsModal() {
    $('saved-projects-modal').hidden = false;
    const host = $('saved-projects-list');
    host.innerHTML = '<div class="an-empty-saved">Carregando projetos...</div>';
    try {
      const records = (await getSavedProjectRecords()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      host.replaceChildren();
      if (!records.length) {
        host.innerHTML = '<div class="an-empty-saved">Nenhum projeto salvo ainda.<br>Use “Salvar projeto” para guardar sua história aqui.</div>';
        return;
      }
      records.forEach((record) => {
        const row = document.createElement('div');
        row.className = 'an-saved-item';
        const info = document.createElement('div');
        info.className = 'an-saved-info';
        const title = document.createElement('strong');
        title.textContent = record.name || 'Projeto sem título';
        const details = document.createElement('small');
        const date = record.updatedAt ? new Date(record.updatedAt).toLocaleString('pt-BR') : 'Data desconhecida';
        details.textContent = `${record.scenes?.length || 0} cena(s) · ${date}`;
        info.append(title, details);
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'an-btn an-btn-primary';
        openButton.textContent = 'Abrir';
        openButton.addEventListener('click', () => loadSavedProject(record));
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'an-btn an-btn-remove';
        deleteButton.textContent = '×';
        deleteButton.title = 'Excluir projeto salvo';
        deleteButton.addEventListener('click', async () => {
          if (!window.confirm(`Excluir “${record.name || 'Projeto sem título'}” dos projetos salvos?`)) return;
          try {
            await removeSavedProjectRecord(record.id);
            await openSavedProjectsModal();
            toast('Projeto removido da biblioteca local.');
          } catch (error) {
            toast(error.message || 'Não foi possível excluir o projeto.');
          }
        });
        row.append(info, openButton, deleteButton);
        host.appendChild(row);
      });
    } catch (error) {
      host.innerHTML = `<div class="an-empty-saved">${escapeHtml(error.message || 'Não foi possível acessar o armazenamento local.')}</div>`;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function normalizeLoadedScenes(inputScenes) {
    if (!Array.isArray(inputScenes) || inputScenes.length === 0) return [createEmptyScene()];
    return inputScenes.map((scene) => {
      const normalized = { ...createEmptyScene(), ...scene };
      normalized.groups = Array.isArray(scene.groups) ? scene.groups.slice(0, 3) : [[], [], []];
      while (normalized.groups.length < 3) normalized.groups.push([]);
      normalized.groups = normalized.groups.map((group) => Array.isArray(group) ? group : []);
      return normalized;
    });
  }

  function loadSavedProject(record) {
    if (isDirty && !window.confirm('Você tem alterações não salvas. Abrir outro projeto mesmo assim?')) return;
    activeProjectId = record.id;
    projectName = record.name || 'Projeto sem título';
    scenes = normalizeLoadedScenes(record.scenes);
    currentSceneIndex = 0;
    globalZoom = Number.isFinite(record.globalZoom) ? record.globalZoom : 100;
    globalHeight = Number.isFinite(record.globalHeight) ? record.globalHeight : 0;
    isDirty = false;
    $('saved-projects-modal').hidden = true;
    setSaveState('Salvo neste navegador');
    loadCurrentScene();
    toast(`Projeto “${projectName}” aberto.`);
  }

  function renderReaderScene() {
    const scene = scenes[readerSceneIndex];
    const background = $('reader-background');
    background.hidden = !scene.bg;
    background.src = scene.bg || '';
    $('reader-placeholder').hidden = Boolean(scene.bg);
    renderPeople($('reader-sprites'), scene, true);
    $('reader-speaker').textContent = scene.speaker || 'Nome do personagem';
    $('reader-text').textContent = scene.text || '...';
    $('reader-text').style.fontFamily = scene.font;
    $('reader-text').style.fontSize = `clamp(12px, ${Math.max(1.1, scene.fontSize / 11)}vw, ${scene.fontSize + 2}px)`;
    $('reader-text').style.color = scene.textColor;
    $('reader-speaker').style.backgroundColor = scene.nameColor;
    $('reader-dialogue').style.backgroundColor = `rgba(250,247,255,${scene.opacity / 100})`;
    $('reader-progress').style.width = `${((readerSceneIndex + 1) / scenes.length) * 100}%`;
    const reader = $('reader');
    reader.classList.remove('scene-enter');
    void reader.offsetWidth;
    reader.classList.add('scene-enter');
  }

  function openReader() {
    captureCurrentSceneFields();
    readerSceneIndex = currentSceneIndex;
    $('reader').hidden = false;
    renderReaderScene();
  }

  function advanceReader() {
    if (readerSceneIndex < scenes.length - 1) {
      readerSceneIndex += 1;
      renderReaderScene();
    } else {
      toast('Fim da visual novel! Você chegou à última cena.');
    }
  }

  $('reader-dialogue').addEventListener('click', advanceReader);
  $('reader-dialogue').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      advanceReader();
    }
  });

  root.addEventListener('keydown', (event) => {
    if ($('reader').hidden) return;
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      advanceReader();
    } else if (event.key === 'ArrowLeft' && readerSceneIndex > 0) {
      readerSceneIndex -= 1;
      renderReaderScene();
    } else if (event.key === 'Escape') {
      $('reader').hidden = true;
    }
  });

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  async function downloadCurrentSceneImage() {
    captureCurrentSceneFields();
    const scene = currentScene();
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    context.fillStyle = '#e9e0f2';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const background = await loadImage(scene.bg);
    if (background) {
      const scale = Math.max(canvas.width / background.width, canvas.height / background.height);
      const width = background.width * scale;
      const height = background.height * scale;
      context.drawImage(background, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }

    const areaWidth = canvas.width / 3;
    const basePersonWidth = areaWidth * 0.56;
    const bottom = canvas.height - globalHeight * 9;
    for (let groupIndex = 0; groupIndex < 3; groupIndex += 1) {
      const group = scene.groups[groupIndex];
      const groupWidth = group.length * basePersonWidth;
      const startX = groupIndex * areaWidth + (areaWidth - groupWidth) / 2;
      for (let personIndex = 0; personIndex < group.length; personIndex += 1) {
        const image = await loadImage(group[personIndex].src);
        if (!image) continue;
        const scale = Math.min(880 / image.height, basePersonWidth / image.width) * (globalZoom / 100);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = startX + personIndex * basePersonWidth + (basePersonWidth - width) / 2;
        context.drawImage(image, x, bottom - height, width, height);
      }
    }

    // Draw dialogue on top of the sprites, matching the editor's layer order.
    context.fillStyle = `rgba(250,247,255,${scene.opacity / 100})`;
    context.strokeStyle = '#8b70b2';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(55, 650, 1490, 205, 12);
    context.fill();
    context.stroke();
    context.fillStyle = scene.nameColor;
    context.beginPath();
    context.roundRect(78, 620, 390, 53, 7);
    context.fill();
    context.fillStyle = '#fff';
    context.font = 'bold 27px Arial';
    context.fillText(scene.speaker || 'Nome do personagem', 100, 655);
    context.fillStyle = scene.textColor;
    context.font = `${scene.fontSize * 1.6}px Georgia`;
    const words = (scene.text || '').split(/\s+/);
    let line = '';
    let y = 730;
    for (const word of words) {
      const testLine = `${line}${word} `;
      if (context.measureText(testLine).width > 1370 && line) {
        context.fillText(line, 100, y);
        line = `${word} `;
        y += 48;
      } else {
        line = testLine;
      }
    }
    if (line) context.fillText(line, 100, y);

    canvas.toBlob((blob) => {
      if (!blob) {
        toast('Não foi possível exportar a imagem.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `astronic-cena-${currentSceneIndex + 1}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Imagem da cena exportada.');
    }, 'image/png');
  }

  function addNewScene() {
    captureCurrentSceneFields();
    scenes.push(createEmptyScene());
    currentSceneIndex = scenes.length - 1;
    markDirty();
    loadCurrentScene();
  }

  function navigateEditorScene(direction) {
    const nextIndex = currentSceneIndex + direction;
    if (nextIndex < 0 || nextIndex >= scenes.length) return;
    captureCurrentSceneFields();
    currentSceneIndex = nextIndex;
    loadCurrentScene();
  }

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'new-project') openNewProjectModal();
    if (action === 'cancel-new-project') $('new-project-modal').hidden = true;
    if (action === 'saved-projects') await openSavedProjectsModal();
    if (action === 'close-saved-projects') $('saved-projects-modal').hidden = true;
    if (action === 'save-project') await saveCurrentProject();
    if (action === 'remove-background') {
      currentScene().bg = null;
      currentScene().bgName = '';
      $('background-upload').value = '';
      markDirty();
      loadCurrentScene();
    }
    if (action === 'add-scene') addNewScene();
    if (action === 'previous-scene') navigateEditorScene(-1);
    if (action === 'next-scene') navigateEditorScene(1);
    if (action === 'download-image') await downloadCurrentSceneImage();
    if (action === 'open-reader') openReader();
    if (action === 'reader-exit') $('reader').hidden = true;
    if (action === 'reader-next') advanceReader();
    if (action === 'reader-previous') {
      if (readerSceneIndex > 0) {
        readerSceneIndex -= 1;
        renderReaderScene();
      } else {
        toast('Esta é a primeira cena.');
      }
    }
  });

  $('new-project-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await createProject($('new-project-name').value);
  });

  $('new-project-modal').addEventListener('click', (event) => {
    if (event.target === $('new-project-modal')) $('new-project-modal').hidden = true;
  });
  $('saved-projects-modal').addEventListener('click', (event) => {
    if (event.target === $('saved-projects-modal')) $('saved-projects-modal').hidden = true;
  });

  // Start with a clean workspace. A named project is created through the header button.
  setSaveState('Crie ou abra um projeto');
  updateProjectNameDisplay();
  loadCurrentScene();
})();
