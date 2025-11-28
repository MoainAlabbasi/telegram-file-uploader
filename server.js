// ══════════════════════════════════════════════════════════════════════════
// 🚀 Telegram File Manager - AI Powered Backend (Modular Version)
// هذا الخادم يدير الملفات، ويربط بين تيليجرام، قاعدة البيانات، والذكاء الاصطناعي
// ══════════════════════════════════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 👇 استيراد ملفات التعليمات (Prompts) من المجلد الخارجي
// نستخدم try-catch لضمان عمل السيرفر حتى لو نسيت إنشاء الملفات
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
// نستخدم الموديل 2.5 Flash لأنه الأحدث والأسرع
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// 🗄️ استيراد دوال قاعدة البيانات (Supabase)
const {
  saveFile, 
  getAllFiles, 
  searchFiles, 
  deleteFile, 
  getStats, 
  getFileType, 
  getFileById, 
  getFileSummary,  // دالة جلب الملخص المحفوظ
  saveFileSummary, // دالة حفظ الملخص الجديد
  isConfigured: isSupabaseConfigured
} = require('./supabase');

// إعدادات التطبيق
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const CHAT_ID = process.env.CHAT_ID || 'YOUR_CHAT_ID';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// إعداد Multer (لرفع الملفات إلى الذاكرة المؤقتة RAM)
const storage = multer.memoryStorage();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // حد 50 ميجا

// ═══════════════════════════════════════════════════════
// 🛠️ دوال مساعدة (Helpers)
// ═══════════════════════════════════════════════════════

/**
 * دالة لرفع نص (مثل الملخص) كملف MD إلى تيليجرام
 */
async function uploadToTelegramAsFile(text, originalName, type, replyId) {
    try {
        const formData = new FormData();
        const buffer = Buffer.from(text, 'utf-8'); // تحويل النص لملف
        const filename = `${originalName}_${type}.md`; // الامتداد Markdown
        
        formData.append('chat_id', CHAT_ID);
        if(replyId) formData.append('reply_to_message_id', replyId); // للترتيب في القناة
        
        formData.append('document', buffer, { 
            filename: filename, 
            contentType: 'text/markdown' 
        });
        
        formData.append('caption', type === 'summary' ? '📝 ملخص محفوظ (AI)' : '❓ كويز');

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
 * دالة لقراءة محتوى ملف نصي من تيليجرام
 */
async function fetchTextFromTelegram(fileId) {
    try {
        // 1. الحصول على مسار الملف
        const f = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
        if(!f.ok) return null;
        
        // 2. تحميل المحتوى كنص
        const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.result.file_path}`);
        return await res.text();
    } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════
// 🧠 نقطة النهاية الذكية (The AI Logic)
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
            console.log(`⚡ ملخص موجود مسبقاً في تيليجرام: ${fileData.file_name}`);
            const cachedText = await fetchTextFromTelegram(cachedSummaryId);
            if (cachedText) return res.json({ success: true, result: cachedText, cached: true });
        }
    }

    // 3️⃣ إذا لم نجد ملخصاً، نستدعي Gemini
    if (!genAI) return res.status(500).json({ success: false, error: 'API Key missing' });

    console.log(`🤖 Gemini يعالج (${action}): ${fileData.file_name}`);
    
    // أ. تحميل الملف الأصلي من تيليجرام
    const fInfo = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileData.telegram_file_id}`)).json();
    if (!fInfo.ok) throw new Error('فشل جلب الملف من تيليجرام');
    const fBuffer = await (await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fInfo.result.file_path}`)).buffer();

    // ب. إعداد الموديل
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // ج. اختيار الموجه (Prompt) من الملفات الخارجية
    const prompt = action === 'summarize' ? summaryPrompt : quizPrompt;

    // د. التوليد
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: fBuffer.toString('base64'), mimeType: fileData.mime_type || 'application/pdf' } }
    ]);
    const textResponse = result.response.text();

    // 4️⃣ (للملخصات فقط) الحفظ للمستقبل
    if (action === 'summarize') {
        console.log("☁️ جاري رفع الملخص لتيليجرام وحفظ الرابط...");
        const newFileId = await uploadToTelegramAsFile(textResponse, fileData.file_name, 'summary', fileData.message_id);
        if (newFileId) await saveFileSummary(fileId, newFileId);
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
// 🌐 مسارات الصفحات والملفات (كما هي)
// ═══════════════════════════════════════════════════════

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gallery.html')));
app.get('/study', (req, res) => res.sendFile(path.join(__dirname, 'public', 'study.html')));

app.get('/health', (req, res) => res.json({ status: 'running', ai: 'Gemini 2.5', supabase: isSupabaseConfigured() }));

// عرض الملف (Streaming)
app.get('/view/:id', async (req, res) => {
  try {
    const r = await getFileById(parseInt(req.params.id));
    if (!r.success) return res.status(404).send('Not Found');
    const f = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${r.data.telegram_file_id}`)).json();
    const d = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.result.file_path}`);
    res.setHeader('Content-Type', r.data.mime_type);
    d.body.pipe(res);
  } catch(e) { res.status(500).end(); }
});

// تحميل الملف
app.get('/download/:id', async (req, res) => {
    try {
        const r = await getFileById(parseInt(req.params.id));
        if (!r.success) return res.status(404).send('Not Found');
        const f = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${r.data.telegram_file_id}`)).json();
        const d = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.result.file_path}`);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.data.file_name)}`);
        d.body.pipe(res);
      } catch(e) { res.status(500).end(); }
});

// رفع الملف
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({error: 'No file'});
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('document', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
        let caption = `📁 ${req.file.originalname} | ${formatBytes(req.file.size)}`;
        if(req.body.description) caption += `\n📝 ${req.body.description}`;
        formData.append('caption', caption);

        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: formData });
        const tgData = await tgRes.json();
        
        if (tgData.ok) {
            const fileData = {
                file_name: req.file.originalname, file_type: getFileType(req.file.mimetype), file_size: req.file.size,
                telegram_file_id: tgData.result.document.file_id, telegram_url: '', message_id: tgData.result.message_id,
                chat_id: CHAT_ID, mime_type: req.file.mimetype, description: req.body.description
            };
            const db = await saveFile(fileData);
            res.json({ success: true, message: 'Uploaded', db_id: db.data?.id });
        } else { res.status(500).json({error: 'Telegram Error'}); }
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('/api/files', async (req, res) => { const r = await getAllFiles(100,0); res.json({success: true, files: r.data}); });
app.get('/api/files/search', async (req, res) => { const r = await searchFiles(req.query.q); res.json({success: true, files: r.data}); });
app.delete('/api/files/:id', async (req, res) => { 
    const r = await deleteFile(parseInt(req.params.id));
    if(r.success) await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({chat_id: r.data.chat_id, message_id: r.data.message_id}) });
    res.json(r); 
});
app.get('/api/stats', async (req, res) => { const r = await getStats(); res.json({success: true, stats: r.data}); });

function formatBytes(bytes) { if(bytes==0) return '0 B'; const k=1024; const i=Math.floor(Math.log(bytes)/Math.log(k)); return Math.round(bytes/Math.pow(k,i)) + ' ' + ['B','KB','MB','GB'][i]; }

app.listen(PORT, () => console.log(`🚀 Server Running on port ${PORT} with Gemini 2.5 Flash`));
