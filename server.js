// ══════════════════════════════════════════════════════════════════════════
// 🚀 Telegram File Manager v4.0 - AI Powered with Quiz System
// نظام متكامل لإدارة الملفات، الملخصات، والاختبارات باستخدام الذكاء الاصطناعي
// ══════════════════════════════════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 👇 استيراد ملفات التعليمات (Prompts)
let summaryPrompt, quizPrompt;
try {
    summaryPrompt = require('./prompts/summary');
    quizPrompt = require('./prompts/quiz');
} catch (e) {
    console.warn('⚠️ تنبيه: لم يتم العثور على ملفات prompts. سيتم استخدام نصوص افتراضية.');
    summaryPrompt = "لخص هذا المحتوى بدقة (Markdown عربي).";
    quizPrompt = "أنشئ كويز من 5 أسئلة (Markdown عربي).";
}

// 🧠 إعداد Google Gemini
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// 🗄️ استيراد دوال قاعدة البيانات
const {
  // Files
  saveFile, 
  getAllFiles, 
  searchFiles, 
  deleteFile, 
  getStats, 
  getFileType, 
  getFileById,
  
  // Summaries
  getFileSummary,
  saveFileSummary,
  getAllSummaries,
  searchSummaries,
  deleteSummary,
  
  // Quizzes
  saveQuiz,
  getAllQuizzes,
  getQuizById,
  searchQuizzes,
  deleteQuiz,
  updateQuiz,
  
  // Stats
  getQuizzesStats,
  getSummariesStats,
  getSystemStats,
  
  isConfigured: isSupabaseConfigured
} = require('./supabase');

// إعدادات التطبيق
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const CHAT_ID = process.env.CHAT_ID || 'YOUR_CHAT_ID';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// إعداد Multer
const storage = multer.memoryStorage();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════
// 🛠️ دوال مساعدة (Helpers)
// ═══════════════════════════════════════════════════════

/**
 * رفع نص كملف MD إلى تيليجرام
 */
async function uploadToTelegramAsFile(text, originalName, type, replyId) {
    try {
        const formData = new FormData();
        const buffer = Buffer.from(text, 'utf-8');
        const filename = `${originalName}_${type}.md`;
        
        formData.append('chat_id', CHAT_ID);
        if(replyId) formData.append('reply_to_message_id', replyId);
        
        formData.append('document', buffer, { 
            filename: filename, 
            contentType: 'text/markdown' 
        });
        
        const caption = type === 'summary' ? '📝 ملخص محفوظ (AI)' : 
                       type === 'quiz' ? '❓ اختبار محفوظ (AI)' : '📄 محتوى';
        formData.append('caption', caption);

        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { 
            method: 'POST', 
            body: formData 
        });
        
        const data = await res.json();
        return data.ok ? data.result.document.file_id : null;
    } catch (e) { 
        console.error('Telegram Upload Error:', e);
        return null; 
    }
}

/**
 * قراءة محتوى ملف نصي من تيليجرام
 */
async function fetchTextFromTelegram(fileId) {
    try {
        const f = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
        if(!f.ok) return null;
        
        const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.result.file_path}`);
        return await res.text();
    } catch (e) { 
        console.error('Fetch Text Error:', e);
        return null; 
    }
}

/**
 * حساب عدد الكلمات في نص
 */
function countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).length;
}

/**
 * تنسيق حجم الملف
 */
function formatBytes(bytes) { 
    if(bytes==0) return '0 B'; 
    const k=1024; 
    const i=Math.floor(Math.log(bytes)/Math.log(k)); 
    return Math.round(bytes/Math.pow(k,i)) + ' ' + ['B','KB','MB','GB'][i]; 
}

/**
 * تحويل Markdown إلى صيغة أخرى باستخدام converter.py
 */
async function convertMarkdown(markdownContent, format, outputFilename) {
    return new Promise(async (resolve, reject) => {
        try {
            // كتابة المحتوى في ملف مؤقت
            const tempInputPath = `/tmp/input_${Date.now()}.md`;
            const tempOutputPath = `/tmp/output_${Date.now()}.${format}`;
            
            await fs.writeFile(tempInputPath, markdownContent, 'utf-8');
            
            // استدعاء converter.py
            const converter = spawn('python3', [
                path.join(__dirname, 'converter.py'),
                tempInputPath,
                tempOutputPath,
                format
            ]);
            
            let stderr = '';
            
            converter.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            converter.on('close', async (code) => {
                // حذف الملف المؤقت للإدخال
                try { await fs.unlink(tempInputPath); } catch(e) {}
                
                if (code === 0) {
                    resolve(tempOutputPath);
                } else {
                    console.error('Converter Error:', stderr);
                    reject(new Error(`Conversion failed: ${stderr}`));
                }
            });
            
            converter.on('error', (err) => {
                reject(err);
            });
        } catch (error) {
            reject(error);
        }
    });
}

// ═══════════════════════════════════════════════════════
// 🌐 مسارات الصفحات الرئيسية
// ═══════════════════════════════════════════════════════

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gallery.html')));
app.get('/study', (req, res) => res.sendFile(path.join(__dirname, 'public', 'study.html')));
app.get('/quizzes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'quizzes.html')));
app.get('/summaries', (req, res) => res.sendFile(path.join(__dirname, 'public', 'summaries.html')));
app.get('/quiz-creator', (req, res) => res.sendFile(path.join(__dirname, 'public', 'quiz-creator.html')));
app.get('/viewer/:type/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'viewer.html')));

app.get('/health', (req, res) => res.json({ 
    status: 'running', 
    version: '4.0',
    ai: 'Gemini 2.5', 
    supabase: isSupabaseConfigured() 
}));

// ═══════════════════════════════════════════════════════
// 📁 API - إدارة الملفات (Files)
// ═══════════════════════════════════════════════════════

// رفع ملف
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({error: 'No file'});
        
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('document', req.file.buffer, { 
            filename: req.file.originalname, 
            contentType: req.file.mimetype 
        });
        
        let caption = `📁 ${req.file.originalname} | ${formatBytes(req.file.size)}`;
        if(req.body.description) caption += `\n📝 ${req.body.description}`;
        formData.append('caption', caption);

        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { 
            method: 'POST', 
            body: formData 
        });
        const tgData = await tgRes.json();
        
        if (tgData.ok) {
            const fileData = {
                file_name: req.file.originalname, 
                file_type: getFileType(req.file.mimetype), 
                file_size: req.file.size,
                telegram_file_id: tgData.result.document.file_id, 
                telegram_url: '', 
                message_id: tgData.result.message_id,
                chat_id: CHAT_ID, 
                mime_type: req.file.mimetype, 
                description: req.body.description
            };
            const db = await saveFile(fileData);
            res.json({ success: true, message: 'Uploaded', db_id: db.data?.id });
        } else { 
            res.status(500).json({error: 'Telegram Error'}); 
        }
    } catch (e) { 
        console.error('Upload Error:', e);
        res.status(500).json({error: e.message}); 
    }
});

// الحصول على جميع الملفات
app.get('/api/files', async (req, res) => { 
    const r = await getAllFiles(100, 0); 
    res.json({success: true, files: r.data}); 
});

// البحث عن ملفات
app.get('/api/files/search', async (req, res) => { 
    const r = await searchFiles(req.query.q); 
    res.json({success: true, files: r.data}); 
});

// حذف ملف
app.delete('/api/files/:id', async (req, res) => { 
    const r = await deleteFile(parseInt(req.params.id));
    if(r.success) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({chat_id: r.data.chat_id, message_id: r.data.message_id}) 
        });
    }
    res.json(r); 
});

// إحصائيات الملفات
app.get('/api/stats', async (req, res) => { 
    const r = await getStats(); 
    res.json({success: true, stats: r.data}); 
});

// عرض ملف (Streaming)
app.get('/view/:id', async (req, res) => {
  try {
    const r = await getFileById(parseInt(req.params.id));
    if (!r.success) return res.status(404).send('Not Found');
    
    const f = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${r.data.telegram_file_id}`)).json();
    const d = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.result.file_path}`);
    
    res.setHeader('Content-Type', r.data.mime_type);
    d.body.pipe(res);
  } catch(e) { 
    console.error('View Error:', e);
    res.status(500).end(); 
  }
});

// تحميل ملف
app.get('/download/:id', async (req, res) => {
    try {
        const r = await getFileById(parseInt(req.params.id));
        if (!r.success) return res.status(404).send('Not Found');
        
        const f = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${r.data.telegram_file_id}`)).json();
        const d = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.result.file_path}`);
        
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.data.file_name)}`);
        d.body.pipe(res);
    } catch(e) { 
        console.error('Download Error:', e);
        res.status(500).end(); 
    }
});

// ═══════════════════════════════════════════════════════
// 🧠 API - الذكاء الاصطناعي (AI)
// ═══════════════════════════════════════════════════════

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { fileId, action } = req.body; // action: 'summarize' OR 'quiz'
    
    // 1️⃣ جلب بيانات الملف الأصلي
    const fileResult = await getFileById(fileId);
    if (!fileResult.success) return res.status(404).json({ success: false, error: 'الملف غير موجود' });
    const fileData = fileResult.data;

    // 2️⃣ (للملخصات فقط) التحقق من الذاكرة Cache
    if (action === 'summarize') {
        const cachedSummaryId = await getFileSummary(fileId);
        if (cachedSummaryId) {
            console.log(`⚡ ملخص موجود مسبقاً: ${fileData.file_name}`);
            const cachedText = await fetchTextFromTelegram(cachedSummaryId);
            if (cachedText) return res.json({ success: true, result: cachedText, cached: true });
        }
    }

    // 3️⃣ استدعاء Gemini
    if (!genAI) return res.status(500).json({ success: false, error: 'API Key missing' });

    console.log(`🤖 Gemini يعالج (${action}): ${fileData.file_name}`);
    
    // أ. تحميل الملف من تيليجرام
    const fInfo = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileData.telegram_file_id}`)).json();
    if (!fInfo.ok) throw new Error('فشل جلب الملف من تيليجرام');
    const fBuffer = await (await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fInfo.result.file_path}`)).buffer();

    // ب. إعداد الموديل
    //const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });


    // ج. اختيار الموجه
    const prompt = action === 'summarize' ? summaryPrompt : quizPrompt;

    // د. التوليد
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: fBuffer.toString('base64'), mimeType: fileData.mime_type || 'application/pdf' } }
    ]);
    const textResponse = result.response.text();

    // 4️⃣ الحفظ
    if (action === 'summarize') {
        console.log("☁️ جاري رفع الملخص...");
        const newFileId = await uploadToTelegramAsFile(textResponse, fileData.file_name, 'summary', fileData.message_id);
        if (newFileId) {
            const wordCount = countWords(textResponse);
            await saveFileSummary(fileId, newFileId, `ملخص ${fileData.file_name}`, wordCount, {});
        }
    }

    res.json({ success: true, result: textResponse, cached: false });

  } catch (error) {
    console.error('AI Error:', error);
    let msg = 'حدث خطأ أثناء المعالجة.';
    if(error.message?.includes('400')) msg = 'الملف غير مدعوم أو المفتاح خطأ.';
    if(error.message?.includes('429')) msg = 'تم تجاوز حد الطلبات (انتظر دقيقة).';
    res.status(500).json({ success: false, error: msg });
  }
});

// ═══════════════════════════════════════════════════════
// 📝 API - إدارة الملخصات (Summaries)
// ═══════════════════════════════════════════════════════

// الحصول على جميع الملخصات
app.get('/api/summaries', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const r = await getAllSummaries(limit, offset);
        res.json({ success: r.success, summaries: r.data, count: r.count });
    } catch (error) {
        console.error('Get Summaries Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// البحث في الملخصات
app.get('/api/summaries/search', async (req, res) => {
    try {
        const r = await searchSummaries(req.query.q);
        res.json({ success: r.success, summaries: r.data });
    } catch (error) {
        console.error('Search Summaries Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// الحصول على محتوى ملخص (Streaming)
app.get('/api/summary/content/:fileId', async (req, res) => {
    try {
        const fileId = parseInt(req.params.fileId);
        const summaryFileId = await getFileSummary(fileId);
        
        if (!summaryFileId) {
            return res.status(404).json({ success: false, error: 'الملخص غير موجود' });
        }
        
        // جلب محتوى الملف من تيليجرام وبثه مباشرة
        const fInfo = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${summaryFileId}`)).json();
        if (!fInfo.ok) throw new Error('فشل جلب الملف');
        
        const fileStream = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fInfo.result.file_path}`);
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        fileStream.body.pipe(res);
    } catch (error) {
        console.error('Get Summary Content Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// حذف ملخص
app.delete('/api/summary/:id', async (req, res) => {
    try {
        const r = await deleteSummary(parseInt(req.params.id));
        // يمكن إضافة حذف من تيليجرام أيضاً إذا لزم الأمر
        res.json(r);
    } catch (error) {
        console.error('Delete Summary Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════
// 🎓 API - إدارة الاختبارات (Quizzes)
// ═══════════════════════════════════════════════════════

// إنشاء اختبار يدوي
app.post('/api/quiz/create', async (req, res) => {
    try {
        const { sourceFileId, quizName, questions } = req.body;
        
        if (!sourceFileId || !quizName || !questions || questions.length === 0) {
            return res.status(400).json({ success: false, error: 'بيانات غير مكتملة' });
        }
        
        // جلب معلومات الملف المصدر
        const fileResult = await getFileById(sourceFileId);
        if (!fileResult.success) {
            return res.status(404).json({ success: false, error: 'الملف المصدر غير موجود' });
        }
        const sourceFile = fileResult.data;
        
        // تحويل الأسئلة إلى Markdown
        let markdownContent = `# ${quizName}\n\n`;
        markdownContent += `**الملف المصدر:** ${sourceFile.file_name}\n\n`;
        markdownContent += `**عدد الأسئلة:** ${questions.length}\n\n`;
        markdownContent += `**مجموع الدرجات:** ${questions.reduce((sum, q) => sum + (q.score || 0), 0)}\n\n`;
        markdownContent += `---\n\n`;
        
        questions.forEach((q, index) => {
            markdownContent += `## السؤال ${index + 1} (${q.score || 0} درجة)\n\n`;
            markdownContent += `**النوع:** ${q.type}\n\n`;
            markdownContent += `**السؤال:** ${q.question}\n\n`;
            
            if (q.options && q.options.length > 0) {
                markdownContent += `**الخيارات:**\n`;
                q.options.forEach((opt, i) => {
                    markdownContent += `${i + 1}. ${opt}\n`;
                });
                markdownContent += `\n`;
            }
            
            markdownContent += `**الإجابة الصحيحة:** ${q.answer}\n\n`;
            
            if (q.explanation) {
                markdownContent += `**الشرح:** ${q.explanation}\n\n`;
            }
            
            markdownContent += `---\n\n`;
        });
        
        // رفع الاختبار إلى تيليجرام
        const telegramFileId = await uploadToTelegramAsFile(
            markdownContent, 
            sourceFile.file_name, 
            'quiz', 
            sourceFile.message_id
        );
        
        if (!telegramFileId) {
            return res.status(500).json({ success: false, error: 'فشل رفع الاختبار إلى تيليجرام' });
        }
        
        // حفظ بيانات الاختبار في قاعدة البيانات
        const quizData = {
            quiz_name: quizName,
            telegram_file_id: telegramFileId,
            source_file_id: sourceFileId,
            source_file_name: sourceFile.file_name,
            question_count: questions.length,
            total_score: questions.reduce((sum, q) => sum + (q.score || 0), 0),
            metadata: {
                questionTypes: [...new Set(questions.map(q => q.type))],
                createdBy: 'manual'
            }
        };
        
        const saveResult = await saveQuiz(quizData);
        
        if (!saveResult.success) {
            return res.status(500).json({ success: false, error: 'فشل حفظ الاختبار في قاعدة البيانات' });
        }
        
        res.json({ 
            success: true, 
            quizId: saveResult.data.id,
            telegramFileId: telegramFileId,
            message: 'تم إنشاء الاختبار بنجاح'
        });
        
    } catch (error) {
        console.error('Create Quiz Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// إنشاء اختبار بالذكاء الاصطناعي
app.post('/api/quiz/generate-ai', async (req, res) => {
    try {
        const { sourceFileId, questionCount, questionTypes, quizName } = req.body;
        
        if (!sourceFileId || !questionCount) {
            return res.status(400).json({ success: false, error: 'بيانات غير مكتملة' });
        }
        
        // جلب معلومات الملف المصدر
        const fileResult = await getFileById(sourceFileId);
        if (!fileResult.success) {
            return res.status(404).json({ success: false, error: 'الملف المصدر غير موجود' });
        }
        const sourceFile = fileResult.data;
        
        if (!genAI) {
            return res.status(500).json({ success: false, error: 'خدمة الذكاء الاصطناعي غير متاحة' });
        }
        
        console.log(`🤖 Gemini ينشئ اختبار من: ${sourceFile.file_name}`);
        
        // تحميل الملف من تيليجرام
        const fInfo = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${sourceFile.telegram_file_id}`)).json();
        if (!fInfo.ok) throw new Error('فشل جلب الملف من تيليجرام');
        const fBuffer = await (await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fInfo.result.file_path}`)).buffer();
        
        // إعداد الموديل والموجه
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        
        let customPrompt = `أنشئ اختباراً تعليمياً من المحتوى المرفق بالمواصفات التالية:
- عدد الأسئلة: ${questionCount}
- أنواع الأسئلة المطلوبة: ${questionTypes ? questionTypes.join(', ') : 'متنوعة'}

يجب أن يكون الاختبار بصيغة Markdown مع التنسيق التالي:
# عنوان الاختبار

## السؤال 1 (X درجة)
**النوع:** [نوع السؤال]
**السؤال:** [نص السؤال]
**الخيارات:** (إن وجدت)
1. خيار أ
2. خيار ب
**الإجابة الصحيحة:** [الإجابة]
**الشرح:** [شرح مختصر]

استخدم اللغة العربية الفصحى وتأكد من وضوح الأسئلة ودقة الإجابات.`;
        
        // التوليد
        const result = await model.generateContent([
            customPrompt,
            { inlineData: { data: fBuffer.toString('base64'), mimeType: sourceFile.mime_type || 'application/pdf' } }
        ]);
        const markdownContent = result.response.text();
        
        // رفع الاختبار إلى تيليجرام
        const telegramFileId = await uploadToTelegramAsFile(
            markdownContent, 
            sourceFile.file_name, 
            'quiz_ai', 
            sourceFile.message_id
        );
        
        if (!telegramFileId) {
            return res.status(500).json({ success: false, error: 'فشل رفع الاختبار إلى تيليجرام' });
        }
        
        // حفظ بيانات الاختبار
        const finalQuizName = quizName || `اختبار ${sourceFile.file_name}`;
        const quizData = {
            quiz_name: finalQuizName,
            telegram_file_id: telegramFileId,
            source_file_id: sourceFileId,
            source_file_name: sourceFile.file_name,
            question_count: questionCount,
            total_score: questionCount * 5, // افتراضي
            metadata: {
                questionTypes: questionTypes || [],
                createdBy: 'ai',
                model: 'gemini-2.0-flash-exp'
            }
        };
        
        const saveResult = await saveQuiz(quizData);
        
        if (!saveResult.success) {
            return res.status(500).json({ success: false, error: 'فشل حفظ الاختبار في قاعدة البيانات' });
        }
        
        res.json({ 
            success: true, 
            quizId: saveResult.data.id,
            content: markdownContent,
            message: 'تم إنشاء الاختبار بنجاح'
        });
        
    } catch (error) {
        console.error('Generate AI Quiz Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// الحصول على جميع الاختبارات
app.get('/api/quizzes', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const r = await getAllQuizzes(limit, offset);
        res.json({ success: r.success, quizzes: r.data, count: r.count });
    } catch (error) {
        console.error('Get Quizzes Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// البحث في الاختبارات
app.get('/api/quizzes/search', async (req, res) => {
    try {
        const r = await searchQuizzes(req.query.q);
        res.json({ success: r.success, quizzes: r.data });
    } catch (error) {
        console.error('Search Quizzes Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// الحصول على اختبار محدد
app.get('/api/quiz/:id', async (req, res) => {
    try {
        const r = await getQuizById(parseInt(req.params.id));
        res.json({ success: r.success, quiz: r.data });
    } catch (error) {
        console.error('Get Quiz Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// الحصول على محتوى اختبار (Streaming)
app.get('/api/quiz/content/:id', async (req, res) => {
    try {
        const quizId = parseInt(req.params.id);
        const quizResult = await getQuizById(quizId);
        
        if (!quizResult.success) {
            return res.status(404).json({ success: false, error: 'الاختبار غير موجود' });
        }
        
        const quiz = quizResult.data;
        
        // جلب محتوى الملف من تيليجرام وبثه مباشرة
        const fInfo = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${quiz.telegram_file_id}`)).json();
        if (!fInfo.ok) throw new Error('فشل جلب الملف');
        
        const fileStream = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fInfo.result.file_path}`);
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        fileStream.body.pipe(res);
    } catch (error) {
        console.error('Get Quiz Content Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// حذف اختبار
app.delete('/api/quiz/:id', async (req, res) => {
    try {
        const r = await deleteQuiz(parseInt(req.params.id));
        // يمكن إضافة حذف من تيليجرام أيضاً
        res.json(r);
    } catch (error) {
        console.error('Delete Quiz Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════
// 📤 API - التصدير (Export)
// ═══════════════════════════════════════════════════════

app.post('/api/export', async (req, res) => {
    try {
        const { content, format, filename } = req.body;
        
        if (!content || !format || !filename) {
            return res.status(400).json({ success: false, error: 'بيانات غير مكتملة' });
        }
        
        const validFormats = ['docx', 'pdf', 'xlsx', 'pptx', 'txt', 'md'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({ success: false, error: 'صيغة غير مدعومة' });
        }
        
        // للصيغ البسيطة (txt, md)
        if (format === 'txt' || format === 'md') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.${format}`);
            return res.send(content);
        }
        
        // للصيغ المعقدة، استخدام converter.py
        const outputPath = await convertMarkdown(content, format, filename);
        
        // إرسال الملف
        res.download(outputPath, `${filename}.${format}`, async (err) => {
            // حذف الملف المؤقت بعد الإرسال
            try { await fs.unlink(outputPath); } catch(e) {}
            
            if (err) {
                console.error('Download Error:', err);
            }
        });
        
    } catch (error) {
        console.error('Export Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════
// 📊 API - الإحصائيات (Stats)
// ═══════════════════════════════════════════════════════

app.get('/api/stats/quizzes', async (req, res) => {
    try {
        const r = await getQuizzesStats();
        res.json({ success: r.success, stats: r.data });
    } catch (error) {
        console.error('Get Quizzes Stats Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stats/summaries', async (req, res) => {
    try {
        const r = await getSummariesStats();
        res.json({ success: r.success, stats: r.data });
    } catch (error) {
        console.error('Get Summaries Stats Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stats/system', async (req, res) => {
    try {
        const r = await getSystemStats();
        res.json({ success: r.success, stats: r.data });
    } catch (error) {
        console.error('Get System Stats Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════
// 🚀 تشغيل الخادم
// ═══════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 MoTech Cloud v4.0 - Server Running');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🧠 AI Engine: ${genAI ? 'Gemini 2.0 Flash ✓' : 'Not Configured ✗'}`);
    console.log(`🗄️ Database: ${isSupabaseConfigured() ? 'Supabase ✓' : 'Not Configured ✗'}`);
    console.log(`📁 Features: Files, Summaries, Quizzes, AI, Export`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
});
