// ═══════════════════════════════════════════════════════
// Supabase Client Configuration - Enhanced v4.0
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
// دوال إدارة الملفات (Files)
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
// دوال إدارة الملخصات (Summaries)
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
    .single();

  if (error || !data) return null;
  return data.telegram_summary_id;
}

/**
 * حفظ ملخص جديد في الجدول المنفصل
 */
async function saveFileSummary(fileId, telegramSummaryId, summaryName = null, wordCount = 0, metadata = {}) {
  if (!supabase) return false;

  const { error } = await supabase
    .from('file_summaries')
    .insert([
      { 
        file_id: fileId, 
        telegram_summary_id: telegramSummaryId,
        summary_name: summaryName,
        word_count: wordCount,
        metadata: metadata
      }
    ]);

  if (error) {
    console.error('❌ خطأ في حفظ الملخص:', error);
    return false;
  }
  return true;
}

/**
 * الحصول على جميع الملخصات
 */
async function getAllSummaries(limit = 50, offset = 0) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error, count } = await supabase
      .from('file_summaries')
      .select(`
        *,
        files:file_id (
          id,
          file_name,
          file_type,
          mime_type
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ خطأ في جلب الملخصات:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data, count };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * البحث في الملخصات
 */
async function searchSummaries(query) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .rpc('search_summaries', { search_query: query });

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
 * حذف ملخص
 */
async function deleteSummary(summaryId) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('file_summaries')
      .delete()
      .eq('id', summaryId)
      .select()
      .single();

    if (error) {
      console.error('❌ خطأ في حذف الملخص:', error);
      return { success: false, error: error.message };
    }

    console.log('✓ تم حذف الملخص:', summaryId);
    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════
// دوال إدارة الاختبارات (Quizzes)
// ═══════════════════════════════════════════════════════

/**
 * حفظ اختبار جديد
 */
async function saveQuiz(quizData) {
  if (!supabase) {
    console.warn('⚠️ Supabase غير متصل - لن يتم حفظ البيانات');
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('quizzes')
      .insert([quizData])
      .select()
      .single();

    if (error) {
      console.error('❌ خطأ في حفظ الاختبار:', error);
      return { success: false, error: error.message };
    }

    console.log('✓ تم حفظ الاختبار في قاعدة البيانات:', data.id);
    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * الحصول على جميع الاختبارات
 */
async function getAllQuizzes(limit = 50, offset = 0) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error, count } = await supabase
      .from('quizzes')
      .select(`
        *,
        files:source_file_id (
          id,
          file_name,
          file_type,
          mime_type
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ خطأ في جلب الاختبارات:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data, count };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * الحصول على اختبار بواسطة ID
 */
async function getQuizById(quizId) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('quizzes')
      .select(`
        *,
        files:source_file_id (
          id,
          file_name,
          file_type,
          mime_type
        )
      `)
      .eq('id', quizId)
      .single();

    if (error) {
      console.error('❌ خطأ في جلب الاختبار:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * البحث في الاختبارات
 */
async function searchQuizzes(query) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .rpc('search_quizzes', { search_query: query });

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
 * حذف اختبار
 */
async function deleteQuiz(quizId) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // الحصول على معلومات الاختبار أولاً
    const { data: quizData, error: fetchError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .single();

    if (fetchError) {
      console.error('❌ خطأ في جلب الاختبار:', fetchError);
      return { success: false, error: fetchError.message };
    }

    // حذف الاختبار
    const { error: deleteError } = await supabase
      .from('quizzes')
      .delete()
      .eq('id', quizId);

    if (deleteError) {
      console.error('❌ خطأ في حذف الاختبار:', deleteError);
      return { success: false, error: deleteError.message };
    }

    console.log('✓ تم حذف الاختبار من قاعدة البيانات:', quizId);
    return { success: true, data: quizData };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * تحديث اختبار
 */
async function updateQuiz(quizId, updates) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('quizzes')
      .update(updates)
      .eq('id', quizId)
      .select()
      .single();

    if (error) {
      console.error('❌ خطأ في تحديث الاختبار:', error);
      return { success: false, error: error.message };
    }

    console.log('✓ تم تحديث الاختبار:', quizId);
    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════
// دوال الإحصائيات
// ═══════════════════════════════════════════════════════

/**
 * الحصول على إحصائيات الاختبارات
 */
async function getQuizzesStats() {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('quizzes_stats')
      .select('*')
      .single();

    if (error) {
      console.error('❌ خطأ في جلب إحصائيات الاختبارات:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * الحصول على إحصائيات الملخصات
 */
async function getSummariesStats() {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('summaries_stats')
      .select('*')
      .single();

    if (error) {
      console.error('❌ خطأ في جلب إحصائيات الملخصات:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

/**
 * الحصول على إحصائيات النظام الكاملة
 */
async function getSystemStats() {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('system_stats')
      .select('*')
      .single();

    if (error) {
      console.error('❌ خطأ في جلب إحصائيات النظام:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ خطأ غير متوقع:', error);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════
// التصدير
// ═══════════════════════════════════════════════════════

module.exports = {
  supabase,
  
  // Files
  saveFile,
  getAllFiles,
  searchFiles,
  deleteFile,
  getFileById,
  getStats,
  getFileType,
  
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
  
  // Utility
  isConfigured: () => supabase !== null
};
