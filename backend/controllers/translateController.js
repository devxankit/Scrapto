import axios from 'axios';
import logger from '../utils/logger.js';

// Bounded in-memory LRU cache to prevent memory exhaustion
const MAX_CACHE_ENTRIES = 1000;
const translationCache = new Map();

const setCache = (key, value) => {
    if (translationCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = translationCache.keys().next().value;
        if (oldestKey) translationCache.delete(oldestKey);
    }
    translationCache.set(key, value);
};

const MAX_BATCH_ITEMS = 50;
const MAX_TEXT_LENGTH = 1000;
const LANG_CODE_REGEX = /^[a-zA-Z-]{2,10}$/;

/**
 * Translate text using Google Cloud Translation API
 * Handles both single 'text' and batch 'texts' inputs.
 */
export const translateText = async (req, res) => {
    try {
        let { text, texts, targetLanguage, targetLang, obj } = req.body;
        const target = targetLanguage || targetLang;

        if (!target || typeof target !== 'string' || !LANG_CODE_REGEX.test(target.trim())) {
            return res.status(400).json({
                success: false,
                message: 'A valid target language code (e.g. "en", "hi") is required'
            });
        }
        const targetClean = target.trim().toLowerCase();

        // Handle object translation format
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            const keys = Object.keys(obj);
            if (keys.length > MAX_BATCH_ITEMS) {
                return res.status(400).json({
                    success: false,
                    message: `Object exceeds maximum allowable properties (${MAX_BATCH_ITEMS})`
                });
            }

            // Validate all string values
            for (const key of keys) {
                if (typeof obj[key] !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: `Property "${key}" must be a string`
                    });
                }
                if (obj[key].length > MAX_TEXT_LENGTH) {
                    return res.status(400).json({
                        success: false,
                        message: `Text for "${key}" exceeds max length of ${MAX_TEXT_LENGTH} characters`
                    });
                }
            }

            // Return original if target is English
            if (targetClean === 'en') {
                return res.status(200).json({
                    success: true,
                    translatedObject: obj,
                    data: { translatedObject: obj }
                });
            }

            const values = Object.values(obj);
            if (values.length === 0) {
                return res.status(200).json({
                    success: true,
                    translatedObject: obj,
                    data: { translatedObject: obj }
                });
            }

            const API_KEY = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;

            // Mock translation for objects
            if (!API_KEY) {
                const translatedObj = {};
                keys.forEach((key, index) => {
                    // No API key: return the original text rather than a "[hi] ..." placeholder.
                    translatedObj[key] = values[index];
                });
                return res.status(200).json({
                    success: true,
                    translatedObject: translatedObj,
                    data: { translatedObject: translatedObj }
                });
            }

            // Real translation for objects
            try {
                const url = `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`;
                const response = await axios.post(url, {
                    q: values,
                    target: targetClean,
                    format: 'text'
                });

                const translatedValues = response.data.data.translations.map(t => t.translatedText);
                const translatedObj = {};
                keys.forEach((key, index) => {
                    translatedObj[key] = translatedValues[index];
                });

                return res.status(200).json({
                    success: true,
                    translatedObject: translatedObj,
                    data: { translatedObject: translatedObj }
                });
            } catch (error) {
                logger.error('Object translation error:', { error: error.message });
                return res.status(200).json({
                    success: true,
                    translatedObject: obj,
                    data: { translatedObject: obj }
                });
            }
        }

        // Original text/texts handling
        const rawInput = texts !== undefined ? texts : text;
        if (rawInput === undefined || rawInput === null) {
            return res.status(400).json({
                success: false,
                message: 'Text(s) and target language are required'
            });
        }

        const isBatch = Array.isArray(rawInput);
        const q = isBatch ? rawInput : [rawInput];

        if (q.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one text entry is required'
            });
        }

        if (q.length > MAX_BATCH_ITEMS) {
            return res.status(400).json({
                success: false,
                message: `Batch translation cannot exceed ${MAX_BATCH_ITEMS} items`
            });
        }

        for (let i = 0; i < q.length; i++) {
            if (typeof q[i] !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: `Item at index ${i} must be a string`
                });
            }
            if (q[i].length > MAX_TEXT_LENGTH) {
                return res.status(400).json({
                    success: false,
                    message: `Text at index ${i} exceeds maximum length of ${MAX_TEXT_LENGTH} characters`
                });
            }
        }

        // Return original if target is English (default)
        if (targetClean === 'en') {
            return res.status(200).json({
                success: true,
                translatedText: isBatch ? q : q[0],
                translations: q,
                data: {
                    translations: q
                }
            });
        }

        const API_KEY = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;

        // Check cache for all items
        const cacheKey = `${q.join('|')}_${targetClean}`;
        if (translationCache.has(cacheKey)) {
            const cached = translationCache.get(cacheKey);
            return res.status(200).json({
                success: true,
                translatedText: isBatch ? cached : cached[0],
                translations: cached,
                data: {
                    translations: cached
                },
                cached: true
            });
        }

        // MOCK TRANSLATION (Fallback)
        if (!API_KEY) {
            // No API key: return the original text (not cached, so a key added
            // later takes effect) rather than a "[hi] ..." placeholder.
            const translations = [...q];

            return res.status(200).json({
                success: true,
                translatedText: isBatch ? translations : translations[0],
                translations: translations,
                data: {
                    translations: translations
                },
                warning: "Running in mock mode. Add GOOGLE_CLOUD_TRANSLATE_API_KEY to .env for real translations."
            });
        }

        // REAL TRANSLATION using Google Cloud Translation API
        const url = `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`;

        const response = await axios.post(url, {
            q: q,
            target: targetClean,
            format: 'text'
        });

        const apiTranslations = response.data.data.translations.map(t => t.translatedText);
        setCache(cacheKey, apiTranslations);

        res.status(200).json({
            success: true,
            translatedText: isBatch ? apiTranslations : apiTranslations[0],
            translations: apiTranslations,
            data: {
                translations: apiTranslations
            }
        });

    } catch (error) {
        logger.error('Translation error:', { error: error.response?.data || error.message });
        res.status(500).json({
            success: false,
            message: 'Translation failed',
            error: error.response?.data?.error?.message || error.message
        });
    }
};
