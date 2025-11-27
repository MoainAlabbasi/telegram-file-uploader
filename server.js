// ═══════════════════════════════════════════════════════
// Telegram File Manager - Powered by Gemini AI 🧠
// ═══════════════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// إعداد Gemini
// تأكد من وضع المفتاح في Railway باسم GEMINI_API_KEY
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const {
  saveFile, getAllFiles, searchFiles, deleteFile, getStats, getFileType, getFileById, isConfigured: isSupabaseConfigured
} = require('./supabase');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const CHAT_ID = process.env.CHAT_ID || 'YOUR_CHAT_ID';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════
// 🧠 نموذج التلخيص (Gemini 1.5 Flash)
// ═══════════════════════════════════════════════════════

app.post('/api/ai/generate', async (req, res) => {
  try {
    if (!genAI) return res.status(500).json({ success: false, error: 'لم يتم تعيين GEMINI_API_KEY' });

    const { fileId, action } = req.body;
    
    // 1. جلب الملف
    const fileResult = await getFileById(fileId);
    if (!fileResult.success) return res.status(404).json({ success: false, error: 'الملف غير موجود' });
    const fileData = fileResult.data;

    // 2. تحميل من تيليجرام
    const fileInfoUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileData.telegram_file_id}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();
    if (!fileInfo.ok) throw new Error('فشل جلب الملف من تيليجرام');
    
    const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
    const fileResponse = await fetch(directUrl);
    const fileBuffer = await fileResponse.buffer();

    // 3. اختيار الموديل (الاسم الصحيح من القائمة الخاصة بك)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });


    // 4. بناء الموجه (Prompt)
    let prompt = "";
    if (action === 'summarize') {
        prompt = `
        تصرف كخبير أكاديمي.
        ⚠️ التنسيق المطلوب: Markdown عربي فصحى.
        قم بتلخيص المحتوى (سواء كان صورة، PDF، أو نص) إلى تقرير يحتوي على:
        # عنوان المحاضرة
        ## الملخص التنفيذي
        ## النقاط الرئيسية (قائمة نقطية)
        ## المصطلحات الهامة (جدول)
        `;
    } else {
        prompt = `
        أنشئ اختباراً (Quiz) من 5 أسئلة اختيار من متعدد بناءً على المحتوى.
        ضع الإجابات الصحيحة في الأسفل.
        `;
    }

    // 5. الإرسال لـ Gemini
    console.log(`🤖 Gemini يعالج: ${fileData.file_name}`);
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType: fileData.mime_type || 'application/pdf'
        }
      }
    ]);

    const textResponse = result.response.text();
    res.json({ success: true, result: textResponse });

  } catch (error) {
    console.error('Gemini Error:', error);
    let msg = 'حدث خطأ أثناء المعالجة.';
    if(error.message.includes('400')) msg = 'نوع الملف غير مدعوم أو المفتاح غير صالح.';
    if(error.message.includes('404')) msg = 'الموديل غير موجود (تأكد من المفتاح).';
    res.status(500).json({ success: false, error: msg });
  }
});

// ═══════════════════════════════════════════════════════
// بقية الكود (الأساسي)
// ═══════════════════════════════════════════════════════

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gallery.html')));
app.get('/study', (req, res) => res.sendFile(path.join(__dirname, 'public', 'study.html')));
app.get('/health', (req, res) => res.json({ status: 'running', ai_provider: 'Gemini', configured: !!genAI }));

app.get('/view/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const result = await getFileById(fileId);
    if (!result.success) return res.status(404).send('Not Found');
    const f = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${result.data.telegram_file_id}`).then(r=>r.json());
    const d = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.result.file_path}`);
    res.setHeader('Content-Type', result.data.mime_type || 'application/octet-stream');
    d.body.pipe(res);
  } catch(e) { res.status(500).end(); }
});

app.get('/download/:id', async (req, res) => {
    try {
        const fileId = parseInt(req.params.id);
        const result = await getFileById(fileId);
        if (!result.success) return res.status(404).send('Not Found');
        const f = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${result.data.telegram_file_id}`).then(r=>r.json());
        const d = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.result.file_path}`);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.data.file_name)}`);
        d.body.pipe(res);
      } catch(e) { res.status(500).end(); }
});

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
    if(r.success) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({chat_id: r.data.chat_id, message_id: r.data.message_id})
        });
    }
    res.json(r); 
});
app.get('/api/stats', async (req, res) => { const r = await getStats(); res.json({success: true, stats: r.data}); });

function formatBytes(bytes) { if(bytes==0) return '0 B'; const k=1024; const i=Math.floor(Math.log(bytes)/Math.log(k)); return Math.round(bytes/Math.pow(k,i)) + ' ' + ['B','KB','MB','GB'][i]; }

app.listen(PORT, () => console.log(`🚀 Server Running on port ${PORT} with Gemini AI`));
