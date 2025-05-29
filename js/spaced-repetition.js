/**
 * 間隔重複學習系統 (Spaced Repetition System)
 * 基於SuperMemo SM-2算法的改進版本
 * 針對詞彙學習進行優化
 */

class SpacedRepetitionSystem {
    constructor() {
        this.easeFactor = 2.5;
        this.interval = 1;
        this.repetitions = 0;
        this.nextReviewDate = new Date();
        
        // 學習階段定義
        this.LEARNING_STAGES = {
            NEW: 'new',           // 新詞彙
            LEARNING: 'learning', // 學習中
            REVIEWING: 'reviewing', // 複習中
            MASTERED: 'mastered'   // 已掌握
        };
        
        // 難度評級
        this.DIFFICULTY_RATINGS = {
            AGAIN: 1,      // 完全不記得
            HARD: 2,       // 困難
            GOOD: 3,       // 一般
            EASY: 4        // 簡單
        };
    }

    /**
     * 計算下次複習時間
     * @param {Object} card - 詞彙卡片物件
     * @param {number} rating - 使用者評分 (1-4)
     * @returns {Object} 更新後的卡片資料
     */
    calculateNextReview(card, rating) {
        let newCard = { ...card };
        
        // 初始化新卡片
        if (!newCard.easeFactor) newCard.easeFactor = 2.5;
        if (!newCard.interval) newCard.interval = 1;
        if (!newCard.repetitions) newCard.repetitions = 0;
        if (!newCard.stage) newCard.stage = this.LEARNING_STAGES.NEW;
        
        const now = new Date();
        
        switch (rating) {
            case this.DIFFICULTY_RATINGS.AGAIN:
                // 完全不記得 - 重新開始學習
                newCard.repetitions = 0;
                newCard.interval = 1;
                newCard.stage = this.LEARNING_STAGES.LEARNING;
                newCard.nextReviewDate = new Date(now.getTime() + (10 * 60 * 1000)); // 10分鐘後
                break;
                
            case this.DIFFICULTY_RATINGS.HARD:
                // 困難 - 縮短間隔
                newCard.easeFactor = Math.max(1.3, newCard.easeFactor - 0.15);
                newCard.interval = Math.max(1, Math.ceil(newCard.interval * 1.2));
                newCard.repetitions += 1;
                newCard.stage = this.LEARNING_STAGES.LEARNING;
                newCard.nextReviewDate = this.getNextReviewDate(now, newCard.interval);
                break;
                
            case this.DIFFICULTY_RATINGS.GOOD:
                // 一般 - 正常間隔增長
                if (newCard.repetitions === 0) {
                    newCard.interval = 1;
                } else if (newCard.repetitions === 1) {
                    newCard.interval = 6;
                } else {
                    newCard.interval = Math.ceil(newCard.interval * newCard.easeFactor);
                }
                
                newCard.repetitions += 1;
                newCard.stage = newCard.repetitions >= 3 ? 
                    this.LEARNING_STAGES.REVIEWING : 
                    this.LEARNING_STAGES.LEARNING;
                    
                newCard.nextReviewDate = this.getNextReviewDate(now, newCard.interval);
                break;
                
            case this.DIFFICULTY_RATINGS.EASY:
                // 簡單 - 大幅增加間隔
                newCard.easeFactor = Math.min(3.0, newCard.easeFactor + 0.15);
                
                if (newCard.repetitions === 0) {
                    newCard.interval = 4;
                } else if (newCard.repetitions === 1) {
                    newCard.interval = 10;
                } else {
                    newCard.interval = Math.ceil(newCard.interval * newCard.easeFactor * 1.3);
                }
                
                newCard.repetitions += 1;
                
                // 如果間隔超過30天且重複次數>=5，則標記為已掌握
                if (newCard.interval >= 30 && newCard.repetitions >= 5) {
                    newCard.stage = this.LEARNING_STAGES.MASTERED;
                } else {
                    newCard.stage = this.LEARNING_STAGES.REVIEWING;
                }
                
                newCard.nextReviewDate = this.getNextReviewDate(now, newCard.interval);
                break;
        }
        
        // 更新學習統計
        newCard.lastReviewDate = now;
        newCard.totalReviews = (newCard.totalReviews || 0) + 1;
        
        return newCard;
    }

    /**
     * 計算具體的下次複習日期
     * @param {Date} baseDate - 基準日期
     * @param {number} intervalDays - 間隔天數
     * @returns {Date} 下次複習日期
     */
    getNextReviewDate(baseDate, intervalDays) {
        const nextDate = new Date(baseDate);
        nextDate.setDate(nextDate.getDate() + intervalDays);
        
        // 加入隨機因子 (±10%) 避免所有卡片在同一天複習
        const randomFactor = 0.9 + Math.random() * 0.2;
        const adjustedHours = intervalDays * 24 * randomFactor;
        
        return new Date(baseDate.getTime() + adjustedHours * 60 * 60 * 1000);
    }

    /**
     * 獲取今日待複習的詞彙
     * @param {Array} cards - 所有詞彙卡片
     * @returns {Array} 待複習的詞彙列表
     */
    getDueCards(cards) {
        const now = new Date();
        return cards.filter(card => {
            if (!card.nextReviewDate) return true; // 新詞彙
            return new Date(card.nextReviewDate) <= now;
        });
    }

    /**
     * 獲取新詞彙學習列表
     * @param {Array} cards - 所有詞彙卡片
     * @param {number} limit - 每日新詞彙限制
     * @returns {Array} 新詞彙列表
     */
    getNewCards(cards, limit = 20) {
        return cards
            .filter(card => !card.stage || card.stage === this.LEARNING_STAGES.NEW)
            .slice(0, limit);
    }

    /**
     * 計算學習統計數據
     * @param {Array} cards - 所有詞彙卡片
     * @returns {Object} 統計數據
     */
    getStatistics(cards) {
        const stats = {
            total: cards.length,
            new: 0,
            learning: 0,
            reviewing: 0,
            mastered: 0,
            dueToday: 0,
            averageEaseFactor: 0,
            totalReviews: 0
        };

        let easeFactorSum = 0;
        let easeFactorCount = 0;
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        cards.forEach(card => {
            switch (card.stage) {
                case this.LEARNING_STAGES.NEW:
                case undefined:
                    stats.new++;
                    break;
                case this.LEARNING_STAGES.LEARNING:
                    stats.learning++;
                    break;
                case this.LEARNING_STAGES.REVIEWING:
                    stats.reviewing++;
                    break;
                case this.LEARNING_STAGES.MASTERED:
                    stats.mastered++;
                    break;
            }

            if (card.nextReviewDate && new Date(card.nextReviewDate) <= today) {
                stats.dueToday++;
            }

            if (card.easeFactor) {
                easeFactorSum += card.easeFactor;
                easeFactorCount++;
            }

            stats.totalReviews += card.totalReviews || 0;
        });

        stats.averageEaseFactor = easeFactorCount > 0 ? 
            (easeFactorSum / easeFactorCount).toFixed(2) : 2.5;

        return stats;
    }

    /**
     * 預測學習進度
     * @param {Array} cards - 所有詞彙卡片
     * @param {number} dailyNewCards - 每日新詞彙數量
     * @param {number} dailyReviews - 每日複習數量
     * @returns {Object} 預測數據
     */
    predictProgress(cards, dailyNewCards = 20, dailyReviews = 100) {
        const stats = this.getStatistics(cards);
        const remainingNew = stats.new;
        const daysToFinishNew = Math.ceil(remainingNew / dailyNewCards);
        
        // 簡單的預測模型
        const averageRetention = 0.85; // 假設85%的保留率
        const estimatedMasteryDays = Math.ceil(daysToFinishNew * 2.5);
        
        return {
            daysToFinishNewCards: daysToFinishNew,
            estimatedDaysToMastery: estimatedMasteryDays,
            projectedMasteredWords: Math.floor(stats.total * averageRetention),
            recommendedDailyStudyTime: Math.ceil((dailyNewCards * 2 + dailyReviews * 0.5) / 60) // 分鐘
        };
    }

    /**
     * 獲取困難詞彙列表
     * @param {Array} cards - 所有詞彙卡片
     * @returns {Array} 困難詞彙列表
     */
    getDifficultCards(cards) {
        return cards
            .filter(card => {
                // 困難詞彙定義：
                // 1. 易度因子低於2.0
                // 2. 重複次數多但仍在學習階段
                // 3. 最近評分低
                return (card.easeFactor && card.easeFactor < 2.0) ||
                       (card.repetitions >= 5 && card.stage === this.LEARNING_STAGES.LEARNING) ||
                       (card.lastRating && card.lastRating <= 2);
            })
            .sort((a, b) => (a.easeFactor || 2.5) - (b.easeFactor || 2.5));
    }

    /**
     * 匯出學習數據
     * @param {Array} cards - 所有詞彙卡片
     * @returns {Object} 可匯出的數據
     */
    exportData(cards) {
        return {
            exportDate: new Date().toISOString(),
            version: "1.0",
            statistics: this.getStatistics(cards),
            cards: cards.map(card => ({
                ...card,
                exportNote: "Generated by Wabi-Sabi Vocabulary Learning System"
            }))
        };
    }

    /**
     * 導入學習數據
     * @param {Object} data - 導入的數據
     * @returns {Array} 處理後的詞彙卡片
     */
    importData(data) {
        if (!data.cards || !Array.isArray(data.cards)) {
            throw new Error("Invalid import data format");
        }

        return data.cards.map(card => {
            // 驗證和清理數據
            const cleanCard = {
                ...card,
                easeFactor: card.easeFactor || 2.5,
                interval: card.interval || 1,
                repetitions: card.repetitions || 0,
                stage: card.stage || this.LEARNING_STAGES.NEW
            };

            // 確保日期格式正確
            if (card.nextReviewDate) {
                cleanCard.nextReviewDate = new Date(card.nextReviewDate);
            }
            if (card.lastReviewDate) {
                cleanCard.lastReviewDate = new Date(card.lastReviewDate);
            }

            return cleanCard;
        });
    }
}

// 全域實例
window.SRS = new SpacedRepetitionSystem(); 