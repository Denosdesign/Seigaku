/**
 * 靜學 - Wabi-Sabi Vocabulary Learning System
 * 主應用程式邏輯 - 支援多詞彙表系統
 */

class VocabularyApp {
    constructor() {
        this.vocabulary = [];
        this.currentWordIndex = 0;
        this.currentMode = 'learn';
        this.isCardFlipped = false;
        this.currentListId = null; // 當前詞彙表ID
        this.studySession = {
            startTime: null,
            wordsStudied: 0,
            correctAnswers: 0
        };
        this.settings = {
            dailyGoal: 20,
            autoPronounce: false,
            showExamples: true
        };
        
        this.init();
    }

    async init() {
        // 載入設定和當前列表
        this.loadSettings();
        this.currentListId = SettingsManager.loadCurrentList();
        
        // 載入詞彙和進度
        await this.loadCurrentVocabularyList();
        this.loadProgress();
        
        // 設定事件監聽器和UI
        this.setupEventListeners();
        this.setupListSelector();
        this.initializeCanvas();
        this.updateUI();
        this.startStudySession();
        
        // 確保進度條初始狀態正確
        setTimeout(() => {
            this.updateProgress();
            this.updateListSelector();
        }, 100);
    }

    /**
     * 載入當前詞彙列表
     */
    async loadCurrentVocabularyList() {
        const listConfig = VocabConfig.getListById(this.currentListId);
        if (!listConfig) {
            console.error('找不到詞彙表配置:', this.currentListId);
            this.currentListId = VocabConfig.getDefaultList().id;
            SettingsManager.saveCurrentList(this.currentListId);
            return this.loadCurrentVocabularyList();
        }

        try {
            const response = await fetch(listConfig.csvFile);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const csvText = await response.text();
            
            // 驗證CSV格式
            const validation = VocabConfig.validateCsvFormat(csvText);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            this.vocabulary = this.parseCSV(csvText, this.currentListId);
            console.log(`載入了 ${listConfig.displayName}: ${this.vocabulary.length} 個詞彙`);
        } catch (error) {
            console.error('載入詞彙失敗:', error);
            this.showNotification(`載入 ${listConfig.displayName} 失敗: ${error.message}`, 'error');
            
            // 如果當前列表載入失敗，嘗試載入預設列表
            if (this.currentListId !== VocabConfig.getDefaultList().id) {
                this.currentListId = VocabConfig.getDefaultList().id;
                SettingsManager.saveCurrentList(this.currentListId);
                return this.loadCurrentVocabularyList();
            }
        }
    }

    /**
     * 解析CSV檔案
     */
    parseCSV(csvText, listId) {
        const lines = csvText.split('\n');
        const vocabulary = [];
        
        // 跳過標題行
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const [english, partOfSpeech, chinese] = line.split(',');
                if (english && chinese) {
                    vocabulary.push({
                        id: `${listId}_${i}`, // 使用列表ID前綴確保唯一性
                        listId: listId,
                        english: english.trim(),
                        partOfSpeech: partOfSpeech ? partOfSpeech.trim() : '',
                        chinese: chinese.trim(),
                        // SRS 相關屬性
                        stage: SRS.LEARNING_STAGES.NEW,
                        easeFactor: 2.5,
                        interval: 1,
                        repetitions: 0,
                        nextReviewDate: null,
                        lastReviewDate: null,
                        totalReviews: 0,
                        isDifficult: false,
                        lastRating: null
                    });
                }
            }
        }
        
        return vocabulary;
    }

    /**
     * 載入設定
     */
    loadSettings() {
        this.settings = SettingsManager.loadAppSettings();
        this.applySettings();
    }

    /**
     * 載入學習進度
     */
    loadProgress() {
        const savedProgress = ProgressManager.loadListProgress(this.currentListId);
        if (savedProgress) {
            // 合併進度資料到詞彙中
            savedProgress.forEach(savedCard => {
                const vocabIndex = this.vocabulary.findIndex(v => v.id === savedCard.id);
                if (vocabIndex !== -1) {
                    this.vocabulary[vocabIndex] = { ...this.vocabulary[vocabIndex], ...savedCard };
                    // 確保日期格式正確
                    if (savedCard.nextReviewDate) {
                        this.vocabulary[vocabIndex].nextReviewDate = new Date(savedCard.nextReviewDate);
                    }
                    if (savedCard.lastReviewDate) {
                        this.vocabulary[vocabIndex].lastReviewDate = new Date(savedCard.lastReviewDate);
                    }
                }
            });
        }
    }

    /**
     * 儲存進度
     */
    saveProgress() {
        const progressData = this.vocabulary.map(word => ({
            id: word.id,
            listId: word.listId,
            stage: word.stage,
            easeFactor: word.easeFactor,
            interval: word.interval,
            repetitions: word.repetitions,
            nextReviewDate: word.nextReviewDate,
            lastReviewDate: word.lastReviewDate,
            totalReviews: word.totalReviews,
            isDifficult: word.isDifficult,
            lastRating: word.lastRating
        }));
        
        ProgressManager.saveListProgress(this.currentListId, progressData);
        
        // 儲存學習統計
        const stats = SRS.getStatistics(this.vocabulary);
        ProgressManager.saveListStats(this.currentListId, {
            ...stats,
            totalStudyTime: this.getTotalStudyTime()
        });
    }

    /**
     * 設定詞彙列表選擇器
     */
    setupListSelector() {
        // 更新當前列表顯示
        this.updateListSelector();
        
        // 列表選擇器按鈕事件
        document.getElementById('list-selector-btn').addEventListener('click', () => {
            this.toggleListDropdown();
        });
        
        // 關閉下拉選單
        document.getElementById('close-dropdown').addEventListener('click', () => {
            this.hideListDropdown();
        });
        
        // 點擊外部關閉下拉選單
        document.addEventListener('click', (e) => {
            const selector = document.querySelector('.vocab-selector');
            if (!selector.contains(e.target)) {
                this.hideListDropdown();
            }
        });
        
        // 填充列表選項
        this.populateListOptions();
    }

    /**
     * 更新詞彙列表選擇器顯示
     */
    updateListSelector() {
        const currentList = VocabConfig.getListById(this.currentListId);
        if (!currentList) return;

        // 更新當前列表資訊
        document.getElementById('current-list-name').textContent = currentList.displayName;
        document.querySelector('.list-icon').textContent = currentList.icon;
        
        // 計算進度
        const studiedWords = this.vocabulary.filter(word => word.totalReviews > 0).length;
        document.getElementById('current-list-progress').textContent = 
            `${studiedWords} / ${this.vocabulary.length}`;
    }

    /**
     * 填充列表選項
     */
    populateListOptions() {
        const listOptions = document.getElementById('list-options');
        const allLists = VocabConfig.getAllLists();
        const allProgress = ProgressManager.getAllListsProgress();
        
        listOptions.innerHTML = allLists.map(list => {
            const progressData = allProgress[list.id];
            const isCurrentList = list.id === this.currentListId;
            const wordsLearned = progressData ? progressData.wordsLearned : 0;
            const totalWords = list.totalWords || 0;
            
            return `
                <div class="list-option ${isCurrentList ? 'current' : ''}" data-list-id="${list.id}">
                    <div class="list-option-icon">${list.icon}</div>
                    <div class="list-option-details">
                        <div class="list-option-name">${list.displayName}</div>
                        <div class="list-option-info">
                            <div class="list-option-level">${list.level}</div>
                            <div class="list-option-progress">${wordsLearned}/${totalWords}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // 添加點擊事件
        listOptions.querySelectorAll('.list-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const listId = e.currentTarget.dataset.listId;
                if (listId !== this.currentListId) {
                    this.switchVocabularyList(listId);
                }
                this.hideListDropdown();
            });
        });
    }

    /**
     * 切換詞彙列表
     */
    async switchVocabularyList(listId) {
        if (listId === this.currentListId) return;
        
        // 儲存當前進度
        this.saveProgress();
        
        // 顯示載入狀態
        this.showNotification('正在切換詞彙表...', 'info');
        
        // 切換到新列表
        this.currentListId = listId;
        SettingsManager.saveCurrentList(listId);
        
        // 載入新列表
        await this.loadCurrentVocabularyList();
        this.loadProgress();
        
        // 重置學習狀態
        this.currentWordIndex = 0;
        this.isCardFlipped = false;
        this.startStudySession();
        
        // 更新UI
        this.updateUI();
        this.updateListSelector();
        this.populateListOptions();
        
        const currentList = VocabConfig.getListById(listId);
        this.showNotification(`已切換到 ${currentList.displayName}`, 'success');
    }

    /**
     * 顯示/隱藏列表下拉選單
     */
    toggleListDropdown() {
        const dropdown = document.getElementById('list-dropdown');
        const isActive = dropdown.classList.contains('active');
        
        if (isActive) {
            this.hideListDropdown();
        } else {
            this.showListDropdown();
        }
    }

    showListDropdown() {
        document.getElementById('list-dropdown').classList.add('active');
        this.populateListOptions(); // 刷新選項
    }

    hideListDropdown() {
        document.getElementById('list-dropdown').classList.remove('active');
    }

    /**
     * 設定事件監聽器
     */
    setupEventListeners() {
        // 導航按鈕
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchMode(e.target.dataset.mode);
            });
        });

        // 詞彙卡片翻轉
        const wordCard = document.getElementById('word-card');
        wordCard.addEventListener('click', () => {
            this.flipCard();
        });

        // 動作按鈕
        document.getElementById('next-word').addEventListener('click', () => {
            this.nextWord();
        });

        document.getElementById('mark-difficult').addEventListener('click', () => {
            this.markAsDifficult();
        });

        // 複習按鈕
        document.getElementById('start-review').addEventListener('click', () => {
            this.startReview();
        });

        // 設定相關
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showSettings();
        });

        document.getElementById('close-settings').addEventListener('click', () => {
            this.hideSettings();
        });

        // 資料管理按鈕
        document.getElementById('reset-current-list').addEventListener('click', () => {
            this.resetCurrentListProgress();
        });

        document.getElementById('reset-all-progress').addEventListener('click', () => {
            this.resetAllProgress();
        });

        // 匯入匯出功能
        document.getElementById('export-progress').addEventListener('click', () => {
            this.exportProgress();
        });

        document.getElementById('import-progress').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });

        document.getElementById('import-file').addEventListener('change', (e) => {
            this.importProgress(e.target.files[0]);
        });

        // 鍵盤快捷鍵
        document.addEventListener('keydown', (e) => {
            this.handleKeyPress(e);
        });

        // 設定變更
        document.getElementById('daily-goal').addEventListener('change', (e) => {
            this.settings.dailyGoal = parseInt(e.target.value);
            this.saveSettings();
        });

        document.getElementById('auto-pronounce').addEventListener('change', (e) => {
            this.settings.autoPronounce = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('show-examples').addEventListener('change', (e) => {
            this.settings.showExamples = e.target.checked;
            this.saveSettings();
            this.updateWordCard();
        });

        // 詞彙表選擇器
        document.getElementById('current-vocab-list').addEventListener('change', (e) => {
            this.switchVocabularyList(e.target.value);
        });
    }

    /**
     * 處理鍵盤按鍵
     */
    handleKeyPress(e) {
        if (this.currentMode !== 'learn') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.flipCard();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.nextWord();
                break;
            case 'KeyD':
                e.preventDefault();
                this.markAsDifficult();
                break;
            case 'Digit1':
                e.preventDefault();
                this.rateWord(1);
                break;
            case 'Digit2':
                e.preventDefault();
                this.rateWord(2);
                break;
            case 'Digit3':
                e.preventDefault();
                this.rateWord(3);
                break;
            case 'Digit4':
                e.preventDefault();
                this.rateWord(4);
                break;
        }
    }

    /**
     * 切換模式
     */
    switchMode(mode) {
        this.currentMode = mode;
        
        // 更新導航按鈕
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

        // 顯示對應的模式區塊
        document.querySelectorAll('.mode-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${mode}-mode`).classList.add('active');

        // 更新對應模式的內容
        switch (mode) {
            case 'learn':
                this.updateLearningMode();
                break;
            case 'review':
                this.updateReviewMode();
                break;
            case 'difficult':
                this.updateDifficultMode();
                break;
            case 'stats':
                this.updateStatsMode();
                break;
            case 'about':
                this.updateAboutMode();
                break;
        }
    }

    /**
     * 更新學習模式
     */
    updateLearningMode() {
        // 首先更新進度條
        this.updateProgress();
        
        const newCards = SRS.getNewCards(this.vocabulary, this.settings.dailyGoal);
        const studiedToday = this.getStudiedToday();
        
        // 檢查是否已達到每日目標
        if (studiedToday >= this.settings.dailyGoal) {
            this.showNotification('今日學習目標已達成！可以繼續學習或進行複習。', 'success');
        }
        
        // 如果沒有新詞彙了，顯示完成訊息
        if (newCards.length === 0) {
            this.showNotification('所有新詞彙已學完！可以進行複習。', 'success');
            this.switchMode('review');
            return;
        }

        // 找到下一個要學習的詞彙
        this.currentWordIndex = this.vocabulary.findIndex(word => word.id === newCards[0].id);
        this.updateWordCard();
    }

    /**
     * 更新複習模式
     */
    updateReviewMode() {
        const dueCards = SRS.getDueCards(this.vocabulary);
        const reviewedToday = this.getReviewedToday();
        
        document.getElementById('due-reviews').textContent = dueCards.length;
        document.getElementById('reviewed-today').textContent = reviewedToday;
    }

    /**
     * 更新困難詞彙模式
     */
    updateDifficultMode() {
        const difficultCards = SRS.getDifficultCards(this.vocabulary);
        const difficultList = document.getElementById('difficult-list');
        
        if (difficultCards.length === 0) {
            difficultList.innerHTML = '<p class="no-difficult">目前沒有困難詞彙！繼續加油！</p>';
            return;
        }

        difficultList.innerHTML = difficultCards.map(card => `
            <div class="difficult-word-item" data-word-id="${card.id}">
                <div class="difficult-word">${card.english}</div>
                <div class="difficult-meaning">${card.chinese}</div>
                <div class="difficult-stats">
                    <small>重複: ${card.repetitions} | 易度: ${(card.easeFactor || 2.5).toFixed(1)}</small>
                </div>
            </div>
        `).join('');

        // 添加點擊事件
        difficultList.querySelectorAll('.difficult-word-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const wordId = parseInt(e.currentTarget.dataset.wordId);
                this.jumpToWord(wordId);
            });
        });
    }

    /**
     * 更新統計模式
     */
    updateStatsMode() {
        // 更新所有列表進度概覽
        this.updateAllListsProgress();
        
        // 更新當前列表統計
        const stats = SRS.getStatistics(this.vocabulary);
        
        document.getElementById('total-learned').textContent = stats.learning + stats.reviewing + stats.mastered;
        document.getElementById('mastered-words').textContent = stats.mastered;
        document.getElementById('streak-days').textContent = this.getStreakDays();
        document.getElementById('study-time').textContent = Math.round(this.getTotalStudyTime() / 60);

        // 稍微延遲繪製圖表，確保Canvas元素已正確渲染
        setTimeout(() => {
            this.drawProgressChart(stats);
        }, 100);
    }

    /**
     * 更新所有列表進度概覽
     */
    updateAllListsProgress() {
        const allProgress = ProgressManager.getAllListsProgress();
        const progressGrid = document.getElementById('lists-progress-grid');
        
        progressGrid.innerHTML = Object.values(allProgress).map(progressData => {
            const list = progressData.listConfig;
            const isCurrentList = list.id === this.currentListId;
            const totalWords = list.totalWords || 0;
            const wordsLearned = progressData.wordsLearned || 0;
            const wordsMastered = progressData.wordsMastered || 0;
            const progressPercentage = totalWords > 0 ? (wordsLearned / totalWords) * 100 : 0;
            
            return `
                <div class="list-progress-card ${isCurrentList ? 'current' : ''}" data-list-id="${list.id}">
                    <div class="list-progress-header">
                        <div class="list-progress-icon">${list.icon}</div>
                        <div class="list-progress-name">${list.displayName}</div>
                        <div class="list-progress-level">${list.level}</div>
                    </div>
                    <div class="list-progress-stats">
                        <span>已學習: ${wordsLearned}</span>
                        <span>已掌握: ${wordsMastered}</span>
                    </div>
                    <div class="list-progress-bar">
                        <div class="list-progress-fill" style="width: ${progressPercentage}%"></div>
                    </div>
                </div>
            `;
        }).join('');
        
        // 添加點擊事件切換列表
        progressGrid.querySelectorAll('.list-progress-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const listId = e.currentTarget.dataset.listId;
                if (listId !== this.currentListId) {
                    this.switchVocabularyList(listId);
                }
            });
        });
    }

    /**
     * 初始化Canvas設定
     */
    initializeCanvas() {
        const canvas = document.getElementById('progress-chart');
        if (canvas) {
            const devicePixelRatio = window.devicePixelRatio || 1;
            const displayWidth = 600;
            const displayHeight = 300;
            
            canvas.width = displayWidth * devicePixelRatio;
            canvas.height = displayHeight * devicePixelRatio;
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            
            const ctx = canvas.getContext('2d');
            ctx.scale(devicePixelRatio, devicePixelRatio);
        }
    }

    /**
     * 繪製進度圖表
     */
    drawProgressChart(stats) {
        const canvas = document.getElementById('progress-chart');
        const ctx = canvas.getContext('2d');
        
        // 獲取設備像素比率以解決模糊問題
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        // 設定Canvas的顯示大小
        const displayWidth = 600;
        const displayHeight = 300;
        
        // 設定Canvas的實際像素大小
        canvas.width = displayWidth * devicePixelRatio;
        canvas.height = displayHeight * devicePixelRatio;
        
        // 設定CSS顯示大小
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        
        // 縮放繪圖context以匹配設備像素比率
        ctx.scale(devicePixelRatio, devicePixelRatio);
        
        // 清除畫布
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        
        // 設定圖表參數
        const padding = 40;
        const chartWidth = displayWidth - padding * 2;
        const chartHeight = displayHeight - padding * 2;
        
        // 資料
        const data = [
            { label: '新詞彙', value: stats.new, color: '#8B7355' },
            { label: '學習中', value: stats.learning, color: '#7A8B7F' },
            { label: '複習中', value: stats.reviewing, color: '#B87333' },
            { label: '已掌握', value: stats.mastered, color: '#8B9D83' }
        ];
        
        // 繪製長條圖
        const barWidth = chartWidth / data.length * 0.6;
        const barSpacing = chartWidth / data.length * 0.4;
        const maxValue = Math.max(...data.map(d => d.value), 1); // 防止除以0
        
        // 設定文字渲染品質
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        
        data.forEach((item, index) => {
            const barHeight = (item.value / maxValue) * chartHeight * 0.7;
            const x = padding + index * (barWidth + barSpacing) + barSpacing / 2;
            const y = padding + chartHeight - barHeight;
            
            // 繪製長條 - 添加漸變效果
            const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, item.color);
            gradient.addColorStop(1, item.color + '80'); // 透明度
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // 繪製長條邊框
            ctx.strokeStyle = item.color;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, barWidth, barHeight);
            
            // 繪製數值 - 更清晰的文字
            ctx.fillStyle = '#3A3A3A';
            ctx.font = `bold 14px Noto Sans TC`;
            ctx.fillText(item.value.toString(), x + barWidth / 2, y - 10);
            
            // 繪製標籤
            ctx.font = `12px Noto Sans TC`;
            ctx.fillStyle = '#6B6B6B';
            ctx.fillText(item.label, x + barWidth / 2, padding + chartHeight + 25);
        });
        
        // 繪製背景網格線（可選）
        ctx.strokeStyle = '#E8E2D5';
        ctx.lineWidth = 0.5;
        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const gridY = padding + (chartHeight * 0.7 / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(padding, gridY);
            ctx.lineTo(padding + chartWidth, gridY);
            ctx.stroke();
            
            // 繪製網格值
            const gridValue = Math.round((maxValue * (gridLines - i)) / gridLines);
            ctx.font = `10px Noto Sans TC`;
            ctx.fillStyle = '#A0A0A0';
            ctx.textAlign = 'right';
            ctx.fillText(gridValue.toString(), padding - 5, gridY);
        }
        
        // 重置文字對齊
        ctx.textAlign = 'center';
    }

    /**
     * 更新詞彙卡片
     */
    updateWordCard() {
        if (this.vocabulary.length === 0) return;

        const currentWord = this.vocabulary[this.currentWordIndex];
        if (!currentWord) return;

        document.getElementById('english-word').textContent = currentWord.english;
        document.getElementById('word-type').textContent = currentWord.partOfSpeech;
        document.getElementById('chinese-meaning').textContent = currentWord.chinese;

        // 生成例句（簡單的模板）
        if (this.settings.showExamples) {
            const exampleSentence = this.generateExampleSentence(currentWord);
            document.getElementById('example-sentence').textContent = exampleSentence;
            document.getElementById('example-sentence').style.display = 'block';
        } else {
            document.getElementById('example-sentence').style.display = 'none';
        }

        // 重置卡片狀態
        this.isCardFlipped = false;
        document.getElementById('word-card').classList.remove('flipped');

        // 自動發音
        if (this.settings.autoPronounce) {
            this.pronounceWord(currentWord.english);
        }
        
        // 確保進度條同步更新
        this.updateProgress();
    }

    /**
     * 生成例句
     */
    generateExampleSentence(word) {
        const templates = {
            'n': [`This is a ${word.english}.`, `I need a ${word.english}.`, `The ${word.english} is important.`],
            'v': [`I ${word.english} every day.`, `Please ${word.english} carefully.`, `They ${word.english} together.`],
            'adj': [`It is very ${word.english}.`, `The ${word.english} one is better.`, `She looks ${word.english}.`],
            'adv': [`He works ${word.english}.`, `Please do it ${word.english}.`, `They arrived ${word.english}.`],
            'prep': [`The book is ${word.english} the table.`, `We walked ${word.english} the park.`],
            'default': [`This word is "${word.english}".`, `"${word.english}" is an English word.`]
        };

        const pos = word.partOfSpeech.toLowerCase();
        const templateArray = templates[pos] || templates.default;
        return templateArray[Math.floor(Math.random() * templateArray.length)];
    }

    /**
     * 翻轉卡片
     */
    flipCard() {
        this.isCardFlipped = !this.isCardFlipped;
        const wordCard = document.getElementById('word-card');
        
        if (this.isCardFlipped) {
            wordCard.classList.add('flipped');
        } else {
            wordCard.classList.remove('flipped');
        }
    }

    /**
     * 下一個詞彙
     */
    nextWord() {
        if (!this.isCardFlipped) {
            this.flipCard();
            return;
        }

        // 如果卡片已翻轉，顯示評分選項
        this.showRatingButtons();
    }

    /**
     * 顯示評分按鈕
     */
    showRatingButtons() {
        const actionButtons = document.querySelector('.action-buttons');
        actionButtons.innerHTML = `
            <button class="rating-btn again-btn" onclick="app.rateWord(1)">
                再次學習 (1)
            </button>
            <button class="rating-btn hard-btn" onclick="app.rateWord(2)">
                困難 (2)
            </button>
            <button class="rating-btn good-btn" onclick="app.rateWord(3)">
                一般 (3)
            </button>
            <button class="rating-btn easy-btn" onclick="app.rateWord(4)">
                簡單 (4)
            </button>
        `;
    }

    /**
     * 評分詞彙
     */
    rateWord(rating) {
        const currentWord = this.vocabulary[this.currentWordIndex];
        
        // 使用SRS算法更新詞彙
        const updatedWord = SRS.calculateNextReview(currentWord, rating);
        this.vocabulary[this.currentWordIndex] = updatedWord;
        
        // 更新學習統計
        this.studySession.wordsStudied++;
        if (rating >= 3) {
            this.studySession.correctAnswers++;
        }

        // 儲存進度
        this.saveProgress();

        // 移動到下一個詞彙
        this.moveToNextWord();
        
        // 恢復原始按鈕
        this.restoreActionButtons();
        
        // 顯示進度通知
        this.showProgressNotification(rating);
        
        // 立即更新進度條
        this.updateProgress();
    }

    /**
     * 恢復動作按鈕
     */
    restoreActionButtons() {
        const actionButtons = document.querySelector('.action-buttons');
        actionButtons.innerHTML = `
            <button class="action-btn difficult-btn" id="mark-difficult">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="2"/>
                </svg>
                標記困難
            </button>
            <button class="action-btn next-btn" id="next-word">
                下一個
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        `;
        
        // 重新綁定事件
        document.getElementById('next-word').addEventListener('click', () => {
            this.nextWord();
        });
        document.getElementById('mark-difficult').addEventListener('click', () => {
            this.markAsDifficult();
        });
    }

    /**
     * 移動到下一個詞彙
     */
    moveToNextWord() {
        const newCards = SRS.getNewCards(this.vocabulary, this.settings.dailyGoal);
        
        if (newCards.length === 0) {
            this.showCompletionMessage();
            return;
        }

        this.currentWordIndex = this.vocabulary.findIndex(word => word.id === newCards[0].id);
        this.updateWordCard();
        this.updateProgress();
    }

    /**
     * 顯示完成訊息
     */
    showCompletionMessage() {
        const accuracy = this.studySession.wordsStudied > 0 ? 
            Math.round((this.studySession.correctAnswers / this.studySession.wordsStudied) * 100) : 0;
        
        this.showNotification(
            `今日學習完成！學習了 ${this.studySession.wordsStudied} 個詞彙，正確率 ${accuracy}%`, 
            'success'
        );
        
        this.switchMode('review');
    }

    /**
     * 標記為困難詞彙
     */
    markAsDifficult() {
        const currentWord = this.vocabulary[this.currentWordIndex];
        currentWord.isDifficult = true;
        this.saveProgress();
        this.showNotification('已標記為困難詞彙', 'info');
    }

    /**
     * 開始複習
     */
    startReview() {
        const dueCards = SRS.getDueCards(this.vocabulary);
        
        if (dueCards.length === 0) {
            this.showNotification('目前沒有需要複習的詞彙！', 'info');
            return;
        }

        this.currentWordIndex = this.vocabulary.findIndex(word => word.id === dueCards[0].id);
        this.switchMode('learn');
    }

    /**
     * 跳轉到指定詞彙
     */
    jumpToWord(wordId) {
        const wordIndex = this.vocabulary.findIndex(word => word.id === wordId);
        if (wordIndex !== -1) {
            this.currentWordIndex = wordIndex;
            this.switchMode('learn');
        }
    }

    /**
     * 更新進度指示器
     */
    updateProgress() {
        const newCards = SRS.getNewCards(this.vocabulary, this.settings.dailyGoal);
        const studiedToday = this.getStudiedToday();
        const currentProgress = Math.min(studiedToday, this.settings.dailyGoal);
        
        // 更新進度文字
        document.getElementById('current-progress').textContent = currentProgress;
        document.getElementById('total-words').textContent = this.settings.dailyGoal;
        
        // 計算並更新進度條
        const progressPercentage = (currentProgress / this.settings.dailyGoal) * 100;
        const progressFill = document.querySelector('.progress-fill');
        if (progressFill) {
            progressFill.style.width = `${Math.min(progressPercentage, 100)}%`;
        }
        
        // 如果達到每日目標，顯示完成效果
        if (currentProgress >= this.settings.dailyGoal) {
            progressFill.style.background = 'linear-gradient(90deg, var(--success-sage), var(--secondary-moss))';
        } else {
            progressFill.style.background = 'linear-gradient(90deg, var(--secondary-moss), var(--primary-earth))';
        }
    }

    /**
     * 獲取今日已學習詞彙數量
     */
    getStudiedToday() {
        const today = new Date().toDateString();
        return this.vocabulary.filter(word => {
            return word.lastReviewDate && 
                   new Date(word.lastReviewDate).toDateString() === today;
        }).length;
    }

    /**
     * 獲取今日複習數量
     */
    getReviewedToday() {
        const today = new Date().toDateString();
        return this.vocabulary.filter(word => {
            return word.lastReviewDate && 
                   new Date(word.lastReviewDate).toDateString() === today;
        }).length;
    }

    /**
     * 更新UI
     */
    updateUI() {
        // 強制更新進度條
        this.updateProgress();
        this.updateWordCard();
        this.updateListSelector();
        
        // 如果當前是學習模式，確保內容正確
        if (this.currentMode === 'learn') {
            this.updateLearningMode();
        }
    }

    /**
     * 開始學習會話
     */
    startStudySession() {
        this.studySession.startTime = new Date();
        this.studySession.wordsStudied = 0;
        this.studySession.correctAnswers = 0;
    }

    /**
     * 獲取總學習時間（秒）
     */
    getTotalStudyTime() {
        const stats = ProgressManager.loadListStats(this.currentListId);
        if (stats) {
            return stats.totalStudyTime || 0;
        }
        return 0;
    }

    /**
     * 獲取連續學習天數
     */
    getStreakDays() {
        const stats = ProgressManager.loadListStats(this.currentListId);
        if (stats && stats.lastStudyDate) {
            const lastStudyDate = new Date(stats.lastStudyDate);
            const today = new Date();
            const diffTime = Math.abs(today - lastStudyDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 1) {
                return stats.streakDays || 1;
            }
        }
        return 0;
    }

    /**
     * 發音功能
     */
    pronounceWord(word) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(word);
            utterance.lang = 'en-US';
            utterance.rate = 0.8;
            speechSynthesis.speak(utterance);
        }
    }

    /**
     * 顯示設定
     */
    showSettings() {
        document.getElementById('settings-modal').classList.add('active');
        
        // 載入當前設定
        document.getElementById('daily-goal').value = this.settings.dailyGoal;
        document.getElementById('auto-pronounce').checked = this.settings.autoPronounce;
        document.getElementById('show-examples').checked = this.settings.showExamples;
        
        // 填充詞彙表選擇器
        this.populateVocabListSelect();
    }

    /**
     * 填充設定中的詞彙表選擇器
     */
    populateVocabListSelect() {
        const select = document.getElementById('current-vocab-list');
        const allLists = VocabConfig.getAllLists();
        
        select.innerHTML = allLists.map(list => 
            `<option value="${list.id}" ${list.id === this.currentListId ? 'selected' : ''}>
                ${list.icon} ${list.displayName} (${list.level})
            </option>`
        ).join('');
    }

    /**
     * 匯出進度
     */
    exportProgress() {
        try {
            const data = ProgressManager.exportListProgress(this.currentListId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `vocab-progress-${this.currentListId}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('進度匯出成功', 'success');
        } catch (error) {
            this.showNotification('匯出失敗: ' + error.message, 'error');
        }
    }

    /**
     * 匯入進度
     */
    async importProgress(file) {
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            ProgressManager.importListProgress(data);
            
            // 如果匯入的是當前列表，重新載入進度
            if (data.listId === this.currentListId) {
                this.loadProgress();
                this.updateUI();
            }
            
            this.showNotification('進度匯入成功', 'success');
        } catch (error) {
            this.showNotification('匯入失敗: ' + error.message, 'error');
        }
        
        // 重置檔案輸入
        document.getElementById('import-file').value = '';
    }

    /**
     * 重置當前列表進度
     */
    resetCurrentListProgress() {
        const currentList = VocabConfig.getListById(this.currentListId);
        if (confirm(`確定要重置 ${currentList.displayName} 的所有學習進度嗎？此操作無法復原。`)) {
            ProgressManager.clearListProgress(this.currentListId);
            this.loadProgress();
            this.updateUI();
            this.showNotification('當前列表進度已重置', 'success');
        }
    }

    /**
     * 重置所有進度
     */
    resetAllProgress() {
        if (confirm('確定要重置所有詞彙表的學習進度嗎？此操作無法復原。')) {
            VocabConfig.getAllLists().forEach(list => {
                ProgressManager.clearListProgress(list.id);
            });
            localStorage.removeItem('vocab-current-list');
            localStorage.removeItem('vocab-app-settings');
            this.showNotification('所有進度已重置', 'success');
            setTimeout(() => {
                location.reload();
            }, 1000);
        }
    }

    /**
     * 儲存設定
     */
    saveSettings() {
        SettingsManager.saveAppSettings(this.settings);
    }

    /**
     * 隱藏設定
     */
    hideSettings() {
        document.getElementById('settings-modal').classList.remove('active');
    }

    /**
     * 套用設定
     */
    applySettings() {
        // 套用設定到UI
        if (this.settings.showExamples) {
            document.getElementById('show-examples').checked = true;
        }
    }

    /**
     * 顯示通知
     */
    showNotification(message, type = 'info') {
        // 創建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // 添加樣式
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--white-soft);
            color: var(--text-dark);
            padding: 1rem 1.5rem;
            border-radius: 12px 15px 13px 14px;
            border: 1px solid var(--border-subtle);
            box-shadow: 0 4px 12px var(--shadow-soft);
            z-index: 1001;
            animation: slideIn 0.3s ease;
            max-width: 300px;
        `;
        
        // 根據類型設定顏色
        if (type === 'success') {
            notification.style.borderLeftColor = 'var(--success-sage)';
            notification.style.borderLeftWidth = '4px';
        } else if (type === 'error') {
            notification.style.borderLeftColor = 'var(--warn-clay)';
            notification.style.borderLeftWidth = '4px';
        }
        
        document.body.appendChild(notification);
        
        // 3秒後自動移除
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * 顯示進度通知
     */
    showProgressNotification(rating) {
        const messages = {
            1: '繼續努力！',
            2: '有進步！',
            3: '做得好！',
            4: '太棒了！'
        };
        
        this.showNotification(messages[rating], rating >= 3 ? 'success' : 'info');
    }

    /**
     * 更新關於模式
     */
    updateAboutMode() {
        // 關於頁面是靜態內容，不需要特殊更新
        // 可以在此添加動畫效果或統計追蹤
        console.log('切換到關於頁面');
        
        // 可選：添加頁面瀏覽統計
        const viewCount = localStorage.getItem('about-page-views') || 0;
        localStorage.setItem('about-page-views', parseInt(viewCount) + 1);
    }
}

// 添加動畫CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .rating-btn {
        padding: 0.75rem 1.5rem;
        margin: 0.25rem;
        border: 1px solid var(--border-subtle);
        border-radius: 16px 20px 18px 17px;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 0.9rem;
    }
    
    .again-btn { background: #ffebee; color: #c62828; }
    .hard-btn { background: #fff3e0; color: #ef6c00; }
    .good-btn { background: #e8f5e8; color: #2e7d32; }
    .easy-btn { background: #e3f2fd; color: #1565c0; }
    
    .rating-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px var(--shadow-soft);
    }
`;
document.head.appendChild(style);

// 初始化應用程式
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new VocabularyApp();
}); 