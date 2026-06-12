
export function isRateLimitError(e: any): boolean {
  if (!e) return false;
  
  // Check status code or code property
  if (e.status === 429 || e.code === 429) return true;
  if (e.error?.code === 429 || e.error?.status === 429) return true;
  
  // Check logic for Gemini SDK errors
  let errorString = '';
  try {
    errorString = JSON.stringify(e).toLowerCase();
  } catch (err) {
    errorString = String(e).toLowerCase();
  }

  if (errorString.includes('429') || 
      errorString.includes('resource_exhausted') || 
      errorString.includes('quota') ||
      errorString.includes('rate limit') ||
      errorString.includes('too many requests')) {
    return true;
  }
  
  // Check message property
  const message = (e.message || e.error?.message || '').toLowerCase();
  if (message.includes('429') || 
      message.includes('resource_exhausted') || 
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('too many requests')) {
    return true;
  }

  return false;
}

export async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
