// ═══════════════════════════════════════════════════════
// Telegram File Manager - Backend Server v3.5 (AI Powered 🧠)
// ═══════════════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');
// استدعاء مكتبة الذكاء الاصطناعي
const { GoogleGenerativeAI } = require("@google/generative-ai");

// استيراد وظائف Supabase
const {
  saveFile,
  getAllFiles,
  searchFiles,
  deleteFile,
  getStats,
  getFileType,
  getFileById,
  isConfigured: isSupabaseConfigured
} = require('./supabase');

// إنشاء التطبيق
const app = express();
const PORT = process.env.PORT || 3000;

// المتغيرات البيئية
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const CHAT_ID = process.env.CHAT_ID || 'YOUR_CHAT_ID';

// إعداد Gemini AI
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// إعدادات
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// إعداد Multer لرفع الملفات
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB
  }
});

// ═══════════════════════════════════════════════════════
// المسارات الأساسية (Basic Routes)
// ═══════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

// صفحة المساعد الدراسي الذكي
app.get('/study', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'study.html'));
});

app.get('/health', (req, res) => {
  const isTelegramConfigured = BOT_TOKEN !== 'YOUR_BOT_TOKEN' && CHAT_ID !== 'YOUR_CHAT_ID';
  res.json({
    status: 'running',
    version: '3.5 AI',
    telegram: { configured: isTelegramConfigured },
    ai: { configured: !!genAI }
  });
});

// ═══════════════════════════════════════════════════════
// الجسر الذكي (Streaming)
// ═══════════════════════════════════════════════════════

app.get('/view/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const result = await getFileById(fileId);
    if (!result.success) return res.status(404).send('الملف غير موجود');
    
    const fileData = result.data;
    const fileInfoUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileData.telegram_file_id}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();
    
    if (!fileInfo.ok) return res.status(500).send('خطأ تيليجرام');
    
    const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
    const fileResponse = await fetch(directUrl);
    
    res.setHeader('Content-Type', fileData.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    fileResponse.body.pipe(res);
  } catch (error) {
    console.error('❌ خطأ:', error.message);
    if (!res.headersSent) res.status(500).send('خطأ في الخادم');
  }
});

app.get('/download/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const result = await getFileById(fileId);
    if (!result.success) return res.status(404).json({error: 'غير موجود'});
    
    const fileData = result.data;
    const fileInfoUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileData.telegram_file_id}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();
    
    if (!fileInfo.ok) return res.status(500).json({error: 'خطأ تيليجرام'});
    
    const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
    const fileResponse = await fetch(directUrl);
    
    const encodedFilename = encodeURIComponent(fileData.file_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', fileData.mime_type || 'application/octet-stream');
    fileResponse.body.pipe(res);
  } catch (error) {
    console.error('❌ خطأ:', error.message);
    if (!res.headersSent) res.status(500).send('خطأ في التحميل');
  }
});

// ═══════════════════════════════════════════════════════
// 🧠 نموذج تلخيص المحاضرات (Logic Model)
// ═══════════════════════════════════════════════════════

function buildLecturePrompt(action, fileType) {
  const isVideo = fileType === 'video';
  
  const baseInstruction = `
    تصرف كبروفيسور جامعي ومساعد أكاديمي خبير. مهمتك هي تحليل المحتوى التعليمي بدقة واستخراج المعلومات الهامة.
    ⚠️ تعليمات صارمة للتنسيق (Strict Markdown):
    - المخرجات يجب أن تكون باللغة العربية الفصحى.
    - استخدم تنسيق Markdown باحترافية (عناوين #، قوائم -، جداول).
    - لا تكتب مقدمات مثل "إليك الملخص"، ابدأ في المحتوى فوراً.
  `;

  if (action === 'quiz') {
    return baseInstruction + `
    أنشئ اختباراً دقيقاً من 5 أسئلة (اختيار من متعدد) بناءً على المحتوى.
    التنسيق المطلوب:
    ### السؤال 1: [نص السؤال]
    - [ ] الخيار أ
    - [ ] الخيار ب
    - [ ] الخيار ج
    - [ ] الخيار د
    
    > **الإجابة الصحيحة:** [الحل]
    
    كرر هذا لـ 5 أسئلة.
    `;
  }

  // وضع التلخيص (Summarize)
  return baseInstruction + `
    قم بإعداد "تقرير محاضرة" منظم جداً يحتوي على الأقسام التالية:

    # 📑 [عنوان مقترح للمحاضرة]

    ## 🎯 الملخص التنفيذي
    (فقرة مركزة تشرح الفكرة العامة للمحاضرة)

    ## 🔑 النقاط الجوهرية (Key Takeaways)
    (قائمة نقطية لأهم الأفكار والأرقام والحقائق)
    - **نقطة 1:** الشرح...
    - **نقطة 2:** الشرح...

    ## 📖 قاموس المصطلحات
    (أهم المصطلحات العلمية في جدول)
    | المصطلح | التعريف |
    |:--------:|:-------|
    | ... | ... |

    ${isVideo ? `
    ## ⏱️ الجدول الزمني
    (حدد الدقائق للمواضيع الرئيسية)
    - 00:00 - المقدمة
    - ...
    ` : ''}

    ## 💡 ملاحظات هامة
    (نقاط قد تأتي في الاختبار)
  `;
}

// ═══════════════════════════════════════════════════════
// مسار الذكاء الاصطناعي (AI Endpoint) - الحقيقي 🔥
// ═══════════════════════════════════════════════════════

app.post('/api/ai/generate', async (req, res) => {
  try {
    if (!genAI) return res.status(500).json({ success: false, error: 'لم يتم تعيين GEMINI_API_KEY' });

    const { fileId, action } = req.body;
    
    // 1. جلب بيانات الملف
    const fileResult = await getFileById(fileId);
    if (!fileResult.success) return res.status(404).json({ success: false, error: 'الملف غير موجود' });
    const fileData = fileResult.data;

    // 2. تحميل الملف من تيليجرام
    console.log(`🤖 معالجة AI للملف: ${fileData.file_name}`);
    const fileInfoUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileData.telegram_file_id}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();
    
    if (!fileInfo.ok) throw new Error('فشل جلب الملف من تيليجرام');
    
    const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
    const fileResponse = await fetch(directUrl);
    const fileBuffer = await fileResponse.buffer();

    // 3. المعالجة عبر Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
    const prompt = buildLecturePrompt(action, fileData.file_type);

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
    console.error('❌ AI Error:', error.message);
    let userMsg = 'حدث خطأ أثناء المعالجة الذكية.';
    if (error.message.includes('400')) userMsg = 'نوع الملف غير مدعوم أو تالف.';
    if (error.message.includes('safety')) userMsg = 'تم حجب المحتوى لأسباب الأمان.';
    res.status(500).json({ success: false, error: userMsg });
  }
});

// ═══════════════════════════════════════════════════════
// رفع الملفات
// ═══════════════════════════════════════════════════════

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'لم يتم إرسال ملف' });
    if (BOT_TOKEN === 'YOUR_BOT_TOKEN' || CHAT_ID === 'YOUR_CHAT_ID') {
      return res.status(500).json({ success: false, error: 'إعدادات تيليجرام ناقصة' });
    }

    const file = req.file;
    const description = req.body.description || '';
    
    console.log(`📤 رفع: ${file.originalname}`);

    const formData = new FormData();
    formData.append('chat_id', CHAT_ID);
    formData.append('document', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype
    });
    
    let caption = `📁 ${file.originalname}\n📊 الحجم: ${formatBytes(file.size)}`;
    if (description) caption += `\n\n📝 ${description}`;
    formData.append('caption', caption);

    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    const result = await response.json();

    if (result.ok) {
      const fileId = result.result.document.file_id;
      const messageId = result.result.message_id;
      let fileUrl = '';
      
      if (CHAT_ID.startsWith('-100')) {
        const channelId = CHAT_ID.replace('-100', '');
        fileUrl = `https://t.me/c/${channelId}/${messageId}`;
      } else {
        fileUrl = `https://t.me/${result.result.chat.username || 'telegram'}`;
      }

      const fileData = {
        file_name: file.originalname,
        file_type: getFileType(file.mimetype),
        file_size: file.size,
        telegram_file_id: fileId,
        telegram_url: fileUrl,
        message_id: messageId,
        chat_id: CHAT_ID,
        mime_type: file.mimetype,
        description: description
      };

      const saveResult = await saveFile(fileData);

      res.json({
        success: true,
        file_id: fileId,
        message: 'تم رفع الملف بنجاح!',
        db_id: saveResult.data?.id
      });
    } else {
      console.error('Telegram Error:', result);
      res.status(500).json({ success: false, error: 'خطأ من تيليجرام' });
    }
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════
// API إدارة الملفات
// ═══════════════════════════════════════════════════════

app.get('/api/files', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const result = await getAllFiles(limit, offset);
  if (result.success) res.json({ success: true, files: result.data, total: result.count });
  else res.status(500).json({ success: false, error: result.error });
});

app.get('/api/files/search', async (req, res) => {
  const query = req.query.q || '';
  if (!query) return res.status(400).json({ success: false, error: 'مطلوب كلمة بحث' });
  const result = await searchFiles(query);
  if (result.success) res.json({ success: true, files: result.data });
  else res.status(500).json({ success: false, error: result.error });
});

app.delete('/api/files/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const result = await deleteFile(fileId);
    if (!result.success) return res.status(500).json({ success: false, error: result.error });

    const fileData = result.data;
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: fileData.chat_id,
        message_id: fileData.message_id
      })
    });
    res.json({ success: true, message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  const result = await getStats();
  if (result.success) res.json({ success: true, stats: result.data });
  else res.status(500).json({ success: false, error: result.error });
});

// ═══════════════════════════════════════════════════════
// التشغيل
// ═══════════════════════════════════════════════════════

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + ['Bytes', 'KB', 'MB', 'GB'][i];
}

app.listen(PORT, () => {
  console.log(`🚀 Server Running on http://localhost:${PORT}`);
  console.log(`🧠 AI Features: ${genAI ? 'Enabled' : 'Disabled'}`);
});
