// ═══════════════════════════════════════════════════════
// Telegram File Manager - Backend Server v3.0
// مع دعم الوصف والجسر الذكي لعرض الملفات مباشرة
// ═══════════════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');

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
// المسارات (Routes)
// ═══════════════════════════════════════════════════════

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// صفحة المعرض
app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

// فحص صحة الإعدادات
app.get('/health', (req, res) => {
  const isTelegramConfigured = BOT_TOKEN !== 'YOUR_BOT_TOKEN' && CHAT_ID !== 'YOUR_CHAT_ID';
  const supabaseConfigured = isSupabaseConfigured();
  
  res.json({
    status: 'running',
    version: '3.0',
    telegram: {
      configured: isTelegramConfigured,
      message: isTelegramConfigured 
        ? 'تيليجرام مُعد بشكل صحيح ✓' 
        : 'يرجى تعيين BOT_TOKEN و CHAT_ID'
    },
    supabase: {
      configured: supabaseConfigured,
      message: supabaseConfigured
        ? 'Supabase مُعد بشكل صحيح ✓'
        : 'Supabase غير مُعد - سيعمل المشروع بدون حفظ البيانات'
    }
  });
});

// ═══════════════════════════════════════════════════════
// الجسر الذكي (Smart Bridge) - v3.0 ✨
// ═══════════════════════════════════════════════════════
// عرض الملف مباشرة في المتصفح (نظام Streaming)
app.get('/view/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    
    // 1. جلب المعلومات من الداتابيس
    const result = await getFileById(fileId);
    if (!result.success) {
      return res.status(404).send('المملف غير موجود');
    }
    const fileData = result.data;
    
    // 2. جلب رابط تيليجرام
    const fileInfoUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileData.telegram_file_id}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();
    
    if (!fileInfo.ok) return res.status(500).send('خطأ تيليجرام');
    
    const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
    
    // 3. طلب الملف من تيليجرام (بدون تحميله للذاكرة)
    const fileResponse = await fetch(directUrl);
    
    // 4. إعداد الرؤوس (Headers) فوراً
    res.setHeader('Content-Type', fileData.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');

    // 5. الأنبوب السحري (Piping) - يمرر البيانات من تيليجرام للمستخدم مباشرة
    fileResponse.body.pipe(res);
    
    // معالجة الأخطاء أثناء النقل
    fileResponse.body.on('error', (err) => {
      console.error('Error in stream:', err);
      res.end();
    });

  } catch (error) {
    console.error('❌ خطأ:', error.message);
    if (!res.headersSent) res.status(500).send('خطأ في الخادم');
  }
});

// تحميل الملف (نظام Streaming)
app.get('/download/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    
    // 1. جلب المعلومات
    const result = await getFileById(fileId);
    if (!result.success) return res.status(404).json({error: 'غير موجود'});
    const fileData = result.data;
    
    // 2. جلب رابط تيليجرام
    const fileInfoUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileData.telegram_file_id}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();
    
    if (!fileInfo.ok) return res.status(500).json({error: 'خطأ تيليجرام'});
    
    const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
    
    // 3. بدء تدفق الملف
    const fileResponse = await fetch(directUrl);
    
    // 4. إعداد رؤوس التحميل
    const encodedFilename = encodeURIComponent(fileData.file_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', fileData.mime_type || 'application/octet-stream');
    
    // 5. الأنبوب السحري (Piping)
    fileResponse.body.pipe(res);

  } catch (error) {
    console.error('❌ خطأ:', error.message);
    if (!res.headersSent) res.status(500).send('خطأ في التحميل');
  }
});
// ═══════════════════════════════════════════════════════
// رفع الملف مع دعم الوصف - v3.0 ✨
// ═══════════════════════════════════════════════════════

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // التحقق من وجود الملف
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'لم يتم إرسال ملف'
      });
    }

    // التحقق من إعدادات تيليجرام
    if (BOT_TOKEN === 'YOUR_BOT_TOKEN' || CHAT_ID === 'YOUR_CHAT_ID') {
      return res.status(500).json({
        success: false,
        error: 'الخادم غير مُعد بشكل صحيح. يرجى تعيين BOT_TOKEN و CHAT_ID'
      });
    }

    const file = req.file;
    const description = req.body.description || ''; // الوصف من المستخدم
    
    console.log(`📤 جاري رفع: ${file.originalname} (${formatBytes(file.size)})`);
    if (description) {
      console.log(`📝 الوصف: ${description}`);
    }

    // إعداد FormData لإرسالها إلى تيليجرام
    const formData = new FormData();
    formData.append('chat_id', CHAT_ID);
    formData.append('document', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype
    });
    
    // إنشاء Caption مع الوصف
    let caption = `📁 ${file.originalname}\n📊 الحجم: ${formatBytes(file.size)}`;
    if (description) {
      caption += `\n\n📝 ${description}`;
    }
    formData.append('caption', caption);

    // إرسال الملف إلى تيليجرام
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
      
      // إنشاء رابط للملف
      let fileUrl = '';
      if (CHAT_ID.startsWith('-100')) {
        const channelId = CHAT_ID.replace('-100', '');
        fileUrl = `https://t.me/c/${channelId}/${messageId}`;
      } else {
        fileUrl = `https://t.me/${result.result.chat.username || 'telegram'}`;
      }

      console.log(`✓ تم الرفع بنجاح: ${file.originalname}`);

      // حفظ معلومات الملف في Supabase (مع الوصف)
      const fileData = {
        file_name: file.originalname,
        file_type: getFileType(file.mimetype),
        file_size: file.size,
        telegram_file_id: fileId,
        telegram_url: fileUrl,
        message_id: messageId,
        chat_id: CHAT_ID,
        mime_type: file.mimetype,
        description: description // حفظ الوصف ✨
      };

      const saveResult = await saveFile(fileData);
      
      if (!saveResult.success) {
        console.warn('⚠️ تحذير: تم رفع الملف لكن لم يتم حفظه في قاعدة البيانات');
      }

      res.json({
        success: true,
        file_id: fileId,
        file_url: fileUrl,
        file_name: file.originalname,
        file_size: file.size,
        description: description,
        message: 'تم رفع الملف بنجاح! ✓',
        saved_to_db: saveResult.success,
        db_id: saveResult.data?.id // معرف قاعدة البيانات للاستخدام في /view
      });
    } else {
      console.error('❌ خطأ من تيليجرام:', result.description);
      res.status(500).json({
        success: false,
        error: `خطأ من تيليجرام: ${result.description}`
      });
    }

  } catch (error) {
    console.error('❌ خطأ في الخادم:', error.message);
    res.status(500).json({
      success: false,
      error: `خطأ في الخادم: ${error.message}`
    });
  }
});

// ═══════════════════════════════════════════════════════
// API للملفات
// ═══════════════════════════════════════════════════════

// الحصول على جميع الملفات
app.get('/api/files', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const result = await getAllFiles(limit, offset);

    if (result.success) {
      res.json({
        success: true,
        files: result.data,
        total: result.count,
        limit,
        offset
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// البحث عن ملفات
app.get('/api/files/search', async (req, res) => {
  try {
    const query = req.query.q || '';

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'يرجى إدخال كلمة بحث'
      });
    }

    const result = await searchFiles(query);

    if (result.success) {
      res.json({
        success: true,
        files: result.data,
        query
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// حذف ملف
app.delete('/api/files/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);

    // حذف من قاعدة البيانات والحصول على معلومات الملف
    const result = await deleteFile(fileId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    const fileData = result.data;

    // حذف الرسالة من تيليجرام
    try {
      const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;
      const telegramResponse = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: fileData.chat_id,
          message_id: fileData.message_id
        })
      });

      const telegramResult = await telegramResponse.json();

      if (!telegramResult.ok) {
        console.warn('⚠️ تحذير: تم حذف الملف من قاعدة البيانات لكن لم يتم حذفه من تيليجرام');
      } else {
        console.log('✓ تم حذف الملف من تيليجرام أيضاً');
      }
    } catch (telegramError) {
      console.warn('⚠️ خطأ في حذف الملف من تيليجرام:', telegramError.message);
    }

    res.json({
      success: true,
      message: 'تم حذف الملف بنجاح',
      file: fileData
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// الحصول على إحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    const result = await getStats();

    if (result.success) {
      res.json({
        success: true,
        stats: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════
// دوال مساعدة
// ═══════════════════════════════════════════════════════

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════
// تشغيل الخادم
// ═══════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 Telegram File Manager Server v3.0');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📡 الخادم يعمل على: http://localhost:${PORT}`);
  console.log(`🔧 البيئة: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ BOT_TOKEN: ${BOT_TOKEN !== 'YOUR_BOT_TOKEN' ? 'مُعد ✓' : 'غير مُعد ✗'}`);
  console.log(`✓ CHAT_ID: ${CHAT_ID !== 'YOUR_CHAT_ID' ? 'مُعد ✓' : 'غير مُعد ✗'}`);
  console.log(`✓ Supabase: ${isSupabaseConfigured() ? 'مُعد ✓' : 'غير مُعد (اختياري)'}`);
  console.log('');
  console.log('✨ الميزات الجديدة في v3.0:');
  console.log('   - دعم الوصف للملفات');
  console.log('   - الجسر الذكي (/view و /download)');
  console.log('   - عرض الملفات مباشرة في المتصفح');
  console.log('═══════════════════════════════════════════════════════');
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
  console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ رفض غير معالج:', error);
});


// صفحة المساعد الدراسي الذكي (الجديدة)
app.get('/study', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'study.html'));
});

// ═══════════════════════════════════════════════════════
// مسارات الذكاء الاصطناعي (AI Routes)
// ═══════════════════════════════════════════════════════

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { fileId, action } = req.body; // action: 'summarize' or 'quiz'
    
    // 1. جلب معلومات الملف
    const fileResult = await getFileById(fileId);
    if (!fileResult.success) return res.status(404).json({ success: false, error: 'الملف غير موجود' });
    
    const fileData = fileResult.data;

    // ⛔️ ملاحظة هامة: 
    // لكي يعمل هذا الجزء فعلياً، نحتاج لربطه بـ Gemini API أو OpenAI.
    // الكود أدناه هو "محاكاة" للنتيجة لكي تجرب الواجهة أولاً.
    
    // محاكاة تأخير الشبكة (كأن الذكاء الاصطناعي يفكر)
    await new Promise(resolve => setTimeout(resolve, 2000));

    let aiResponse = "";
    
    if (action === 'summarize') {
        aiResponse = `
### 📝 ملخص ذكي للملف: ${fileData.file_name}
(هذا رد تجريبي لأننا لم نربط API بعد)

1. **النقطة الأساسية الأولى**: يحتوي هذا الملف على معلومات هامة حول الموضوع الرئيسي.
2. **التفاصيل التقنية**: يتطرق الملف لشرح المفاهيم البرمجية بعمق.
3. **الخلاصة**: يعتبر مرجعاً ممتازاً للمراجعة قبل الاختبار.

*ملاحظة: لتعمل هذه الميزة بشكل حقيقي، نحتاج لإضافة Gemini API Key.*
        `;
    } else {
        aiResponse = `
### 🧠 اختبار قصير مقترح
(هذا رد تجريبي)

**س1: ما هو المفهوم الأساسي في هذا الملف؟**
- أ) البرمجة الكائنية
- ب) قواعد البيانات
- ج) الشبكات

**س2: كيف يتم معالجة البيانات؟**
> حاول الإجابة بنفسك ثم راجع الملف للتأكد!
        `;
    }

    res.json({ success: true, result: aiResponse });

  } catch (error) {
    console.error('AI Error:', error);
    res.status(500).json({ success: false, error: 'فشل في المعالجة الذكية' });
  }
});
