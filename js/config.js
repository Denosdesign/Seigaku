/**
 * 詞彙列表配置系統
 * Vocabulary Lists Configuration System
 */

const VocabConfig = {
    // 可用的詞彙列表配置
    lists: [
        {
            id: 'ket',
            displayName: 'KET 詞彙表',
            description: '劍橋英語初級考試核心詞彙',
            csvFile: './vocab csv/ket-ocab.csv',
            totalWords: 1400,
            level: 'A2',
            color: '#8B7355', // 主題色
            icon: '📚',
            isDefault: true
        },
        {
            id: 'b1',
            displayName: 'B1 詞彙表',
            description: 'B1 Preliminary',
            csvFile: './vocab csv/b1-vocab.csv',
            totalWords: 3573,
            level: 'B1',
            color: '#7A8B7F',
            icon: '📖'
        },
        {
            id: 'a2',
            displayName: 'A2 詞彙表',
            description: 'coming soon...',
            csvFile: './vocab csv/a2-vocab.csv',
            totalWords: 0,
            level: 'A2',
            color: '#B87333',
            icon: '💼'
        }
    ],

    // 獲取預設列表
    getDefaultList() {
        return this.lists.find(list => list.isDefault) || this.lists[0];
    },

    // 根據ID獲取列表配置
    getListById(id) {
        return this.lists.find(list => list.id === id);
    },

    // 獲取所有可用列表
    getAllLists() {
        return this.lists;
    },

    // 檢查列表是否存在
    listExists(id) {
        return this.lists.some(list => list.id === id);
    },

    // 添加新列表（動態擴展功能）
    addList(listConfig) {
        // 驗證必要欄位
        const requiredFields = ['id', 'displayName', 'csvFile'];
        for (let field of requiredFields) {
            if (!listConfig[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // 檢查ID是否重複
        if (this.listExists(listConfig.id)) {
            throw new Error(`List with ID '${listConfig.id}' already exists`);
        }

        // 設定預設值
        const defaultConfig = {
            description: '',
            totalWords: 0,
            level: 'Unknown',
            color: '#8B7355',
            icon: '📝',
            isDefault: false
        };

        const fullConfig = { ...defaultConfig, ...listConfig };
        this.lists.push(fullConfig);
        
        return fullConfig;
    },

    // 移除列表
    removeList(id) {
        const index = this.lists.findIndex(list => list.id === id);
        if (index !== -1) {
            return this.lists.splice(index, 1)[0];
        }
        return null;
    },

    // 驗證CSV檔案格式
    validateCsvFormat(csvContent) {
        const lines = csvContent.split('\n');
        if (lines.length < 2) {
            return { valid: false, error: 'CSV file must have at least a header and one data row' };
        }

        const header = lines[0].trim();
        const expectedHeaders = ['英文詞彙,詞性,中文解釋', 'english,pos,chinese', 'word,type,meaning'];
        
        const isValidHeader = expectedHeaders.some(expected => 
            header.toLowerCase().includes(expected.toLowerCase()) ||
            header.split(',').length === 3
        );

        if (!isValidHeader) {
            return { 
                valid: false, 
                error: 'CSV header should contain three columns: English word, part of speech, Chinese meaning' 
            };
        }

        return { valid: true };
    }
};

// 學習進度管理器
const ProgressManager = {
    // 獲取列表的儲存鍵名
    getStorageKey(listId, type = 'progress') {
        return `vocab-${type}-${listId}`;
    },

    // 儲存列表進度
    saveListProgress(listId, progressData) {
        const key = this.getStorageKey(listId);
        localStorage.setItem(key, JSON.stringify(progressData));
    },

    // 載入列表進度
    loadListProgress(listId) {
        const key = this.getStorageKey(listId);
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },

    // 儲存列表統計
    saveListStats(listId, stats) {
        const key = this.getStorageKey(listId, 'stats');
        localStorage.setItem(key, JSON.stringify({
            ...stats,
            lastStudyDate: new Date().toISOString()
        }));
    },

    // 載入列表統計
    loadListStats(listId) {
        const key = this.getStorageKey(listId, 'stats');
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },

    // 獲取所有列表的進度摘要
    getAllListsProgress() {
        const allProgress = {};
        VocabConfig.getAllLists().forEach(list => {
            const progress = this.loadListProgress(list.id);
            const stats = this.loadListStats(list.id);
            
            allProgress[list.id] = {
                listConfig: list,
                progress: progress,
                stats: stats,
                wordsLearned: progress ? progress.filter(word => word.totalReviews > 0).length : 0,
                wordsMastered: progress ? progress.filter(word => word.stage === 'mastered').length : 0
            };
        });
        return allProgress;
    },

    // 清除列表進度
    clearListProgress(listId) {
        localStorage.removeItem(this.getStorageKey(listId));
        localStorage.removeItem(this.getStorageKey(listId, 'stats'));
    },

    // 匯出列表進度
    exportListProgress(listId) {
        const progress = this.loadListProgress(listId);
        const stats = this.loadListStats(listId);
        const listConfig = VocabConfig.getListById(listId);
        
        return {
            listId: listId,
            listConfig: listConfig,
            progress: progress,
            stats: stats,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
    },

    // 匯入列表進度
    importListProgress(data) {
        if (!data.listId || !data.progress) {
            throw new Error('Invalid import data format');
        }

        // 檢查列表是否存在
        if (!VocabConfig.listExists(data.listId)) {
            throw new Error(`List '${data.listId}' does not exist`);
        }

        this.saveListProgress(data.listId, data.progress);
        if (data.stats) {
            this.saveListStats(data.listId, data.stats);
        }

        return true;
    }
};

// 設定管理器
const SettingsManager = {
    // 儲存當前選擇的列表
    saveCurrentList(listId) {
        localStorage.setItem('vocab-current-list', listId);
    },

    // 載入當前選擇的列表
    loadCurrentList() {
        const listId = localStorage.getItem('vocab-current-list');
        if (listId && VocabConfig.listExists(listId)) {
            return listId;
        }
        return VocabConfig.getDefaultList().id;
    },

    // 儲存應用設定
    saveAppSettings(settings) {
        localStorage.setItem('vocab-app-settings', JSON.stringify(settings));
    },

    // 載入應用設定
    loadAppSettings() {
        const data = localStorage.getItem('vocab-app-settings');
        return data ? JSON.parse(data) : {
            dailyGoal: 20,
            autoPronounce: false,
            showExamples: true,
            theme: 'wabi-sabi'
        };
    }
};

// 全域匯出
if (typeof window !== 'undefined') {
    window.VocabConfig = VocabConfig;
    window.ProgressManager = ProgressManager;
    window.SettingsManager = SettingsManager;
}

// Node.js 環境匯出（如果需要）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VocabConfig,
        ProgressManager,
        SettingsManager
    };
} 