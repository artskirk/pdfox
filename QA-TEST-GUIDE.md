# QA Test Guide - OCR Text Rendering Fix

## Bug Fixed
**Issue**: OCR-extracted text was invisible (rendered at 1px height)
**Root Cause**: Font size was calculated from transform matrix instead of using OCR height property
**Fix**: Modified line 775 in pdf-editor.html to use `item.height` for OCR items

---

## Test Suite

### Test 1: Basic OCR Text Visibility
**Objective**: Verify OCR text is now visible and editable

**Steps**:
1. Open browser to: `http://localhost:3000/test-ocr.html`
2. Click "Load & Test OCR" button for `not-editable.pdf`
3. Wait for OCR processing (orange "🔍 OCR Active" badge should appear)
4. Verify console shows: "✓ OCR completed: found XXX words"

**Expected Results**:
- ✅ Orange "OCR Active" badge visible in top toolbar
- ✅ Console shows: "📊 Using 388 OCR items for rendering"
- ✅ Text blocks are visible overlaying the PDF
- ✅ Text appears at correct size (readable, not microscopic)

---

### Test 2: Text Interaction
**Objective**: Verify OCR text is clickable and editable

**Steps**:
1. Ensure "Edit Text" mode is active (red button in toolbar)
2. Hover over OCR-extracted text
3. Click on a text block

**Expected Results**:
- ✅ Text highlights yellow on hover
- ✅ Clicking opens edit modal
- ✅ Original text appears in modal
- ✅ Can modify text and save changes

---

### Test 3: Text Positioning Accuracy
**Objective**: Verify OCR text overlays correctly on original PDF image

**Steps**:
1. Zoom in/out using browser zoom (Ctrl + / Ctrl -)
2. Compare text overlay position with underlying PDF image
3. Check multiple text blocks across the page

**Expected Results**:
- ✅ Text aligns reasonably well with original text in image
- ✅ No major offset or misalignment
- ✅ Text size roughly matches original

---

### Test 4: Diagnostic Page Test
**Objective**: Isolate and verify each step of OCR pipeline

**Steps**:
1. Open: `http://localhost:3000/ocr-debug.html`
2. Click "Load not-editable.pdf"
3. Verify canvas renders (should see PDF page)
4. Click "Run OCR on Page 1"
5. Wait for results
6. Click "Render Text Spans"

**Expected Results**:
- ✅ Test 1: Green checkmark "✓ PDF loaded: 1 pages"
- ✅ Test 2: Green checkmark "✓ Canvas rendered: XXXxXXXpx"
- ✅ Test 3: Green checkmark "✓ OCR complete!" with word count
- ✅ Test 4: Shows extracted text and JSON data
- ✅ Test 5: Green checkmark "✓ Rendered XXX text spans"
- ✅ Red text with blue borders visible over yellow background

---

### Test 5: Full Workflow Test
**Objective**: Test complete edit → save workflow

**Steps**:
1. Load `not-editable.pdf` via test-ocr.html
2. Click on OCR-extracted text
3. Edit text in modal
4. Save changes
5. Click "Download Edited PDF"
6. Open downloaded PDF

**Expected Results**:
- ✅ Text edit saves successfully
- ✅ Edited text shows green border (indicating edited state)
- ✅ Downloaded PDF contains the edited text
- ✅ PDF opens correctly in PDF viewer

---

## Known Limitations

1. **OCR Accuracy**: Text recognition depends on image quality
2. **Positioning**: May not be pixel-perfect due to coordinate system conversion
3. **Font Matching**: OCR text uses 'sans-serif' font (original font unknown)
4. **Processing Time**: OCR takes several seconds on first page load

---

## Console Debug Commands

Open browser console (F12) and run:

```javascript
// Check if OCR is active
console.log('OCR items:', textItems.filter(t => t.isOCR));

// Check text layer visibility
console.log('Text layer visible:', document.getElementById('textLayer').classList.contains('editable'));

// Count rendered text spans
console.log('Text spans:', document.querySelectorAll('#textLayer > span').length);

// Check font sizes
document.querySelectorAll('#textLayer > span').forEach(s => {
    console.log('Font size:', s.style.fontSize, 'Text:', s.textContent.substring(0, 20));
});
```

---

## Regression Testing

Verify regular (non-OCR) PDFs still work:

1. Load `test-invoice-with-images.pdf` (has embedded text)
2. Verify text is visible and editable
3. Ensure no "OCR Active" badge appears

---

## Success Criteria

**Test passes if**:
- All 5 main tests pass
- Text is visible at correct size (not 1px)
- Text is clickable and editable
- No console errors
- Regular PDFs still work correctly

**Test fails if**:
- Text is invisible or microscopic
- Cannot click on text blocks
- Console shows errors
- Regular PDFs break
