// ═══════════════════════════════════════════════════════
// Supabase Client Configuration
// ═══════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

// المتغيرات البيئية
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// التحقق من وجود المتغيرات
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ تحذير: SUPABASE_URL أو SUPABASE_ANON_KEY غير مُعدّ');
  console.warn('   سيعمل المشروع بدون حفظ البيانات في قاعدة البيانات');
}

// إنشاء عميل Supabase
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ═══════════════════════════════════════════════════════
// دوال مساعدة للتعامل مع قاعدة البيانات
// ═══════════════════════════════════════════════════════

/**
 * حفظ معلومات ملف جديد
 */
async function saveFile(fileData) {
  if (!supabase) {
    console.warn('⚠️ Supabase غير متصل - لن يتم حفظ البيانات');
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // حذف description إذا كان فارغاً لتجنب أخطاء قاعدة البيانات
    const cleanData = { ...fileData };
    if (!cleanData.description || cleanData.description.trim() === '') {
      delete cleanData.description;
    }

    const { data, error } = await supabase
      .from('files')
      .insert([cleanData])
      .select()
      .single();

    if (error) {
      console.error('❌ خطأ في حفظ الملف:', error);
      return { success: false, error: error.message };
    }

    console.log('✓ تم حفظ الملف في قاعدة البيانات:', data.id);
    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * الحصول على جميع الملفات
 */
async function getAllFiles(limit = 100, offset = 0) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error, count } = await supabase
      .from('files')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ خطأ في جلب الملفات:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data, count };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * البحث عن ملفات
 */
async function searchFiles(query) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .ilike('file_name', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ خطأ في البحث:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * حذف ملف من قاعدة البيانات
 */
async function deleteFile(fileId) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // الحصول على معلومات الملف أولاً
    const { data: fileData, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fetchError) {
      console.error('❌ خطأ في جلب الملف:', fetchError);
      return { success: false, error: fetchError.message };
    }

    // حذف الملف
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      console.error('❌ خطأ في حذف الملف:', deleteError);
      return { success: false, error: deleteError.message };
    }

    console.log('✓ تم حذف الملف من قاعدة البيانات:', fileId);
    return { success: true, data: fileData };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * الحصول على ملف بواسطة ID
 */
async function getFileById(fileId) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (error) {
      console.error('❌ خطأ في جلب الملف:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * الحصول على إحصائيات الملفات
 */
async function getStats() {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('files_stats')
      .select('*')
      .single();

    if (error) {
      console.error('❌ خطأ في جلب الإحصائيات:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * تحديد نوع الملف بناءً على MIME type
 */
function getFileType(mimeType) {
  if (!mimeType) return 'document';
  
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  
  return 'document';
}

// ═══════════════════════════════════════════════════════
// دوال الملخصات (الجديدة)
// ═══════════════════════════════════════════════════════

/**
 * جلب ملخص الملف (إن وجد)
 */
async function getFileSummary(fileId) {
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from('file_summaries')
    .select('telegram_summary_id')
    .eq('file_id', fileId)
    .single(); // نأخذ ملخص واحد فقط

  if (error || !data) return null;
  return data.telegram_summary_id;
}

/**
 * حفظ ملخص جديد في الجدول المنفصل
 */
async function saveFileSummary(fileId, telegramSummaryId) {
  if (!supabase) return false;

  const { error } = await supabase
    .from('file_summaries')
    .insert([
      { file_id: fileId, telegram_summary_id: telegramSummaryId }
    ]);

  if (error) {
    console.error('❌ خطأ في حفظ الملخص:', error);
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════
// التصدير
// ═══════════════════════════════════════════════════════

module.exports = {
  supabase,
  saveFile,
  getAllFiles,
  searchFiles,
  deleteFile,
  getFileById,
  getStats,
  getFileType,
  getFileSummary,   // <--- جديد
  saveFileSummary,  // <--- جديد
  isConfigured: () => supabase !== null
};
