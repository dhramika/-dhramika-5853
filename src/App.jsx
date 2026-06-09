import { useEffect, useMemo, useState } from 'react';
import { Download, FilePlus, Image, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';

function App() {
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [packetName, setPacketName] = useState('photo-packet');
  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '' });

  useEffect(() => {
    return () => photos.forEach((photo) => URL.revokeObjectURL(photo.src));
  }, [photos]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('contacts');
      if (stored) {
        const parsed = JSON.parse(stored);
        setContacts(parsed);
        console.log('Loaded contacts from storage:', parsed);
      }
    } catch (e) {
      console.error('Error loading contacts:', e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('contacts', JSON.stringify(contacts));
      console.log('Saved contacts to storage:', contacts);
    } catch (e) {
      console.error('Error saving contacts:', e);
    }
  }, [contacts]);

  const selectedCount = useMemo(
    () => photos.filter((photo) => photo.selected).length,
    [photos]
  );

  const packetQrValue = `Photo packet: ${selectedCount} image${selectedCount === 1 ? '' : 's'}`;

  const handleFiles = (fileList) => {
    setError('');
    const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith('image/'));

    if (!imageFiles.length) {
      setError('Please select image files only.');
      return;
    }

    const newPhotos = imageFiles.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      src: URL.createObjectURL(file),
      name: file.name,
      type: file.type,
      selected: true,
    }));

    setPhotos((prev) => {
      prev.forEach((photo) => URL.revokeObjectURL(photo.src));
      return newPhotos;
    });
  };

  const handleFileInput = (event) => {
    handleFiles(event.target.files ?? []);
    event.target.value = null;
  };

  const toggleSelect = (id) => {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, selected: !photo.selected } : photo
      )
    );
  };

  const removePhoto = (id) => setPhotos((current) => current.filter((photo) => photo.id !== id));

  const clearGallery = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.src));
    setPhotos([]);
    setError('');
  };

  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const loadImage = (dataUrl) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

  const addPhotoPage = async (doc, photo, isFirstPage) => {
    const dataUrl = await readFileAsDataURL(photo.file);
    const image = await loadImage(dataUrl);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    let imgWidth = image.naturalWidth;
    let imgHeight = image.naturalHeight;
    const ratio = Math.min(
      (pageWidth - margin * 2) / imgWidth,
      (pageHeight - margin * 2) / imgHeight,
      1
    );

    imgWidth *= ratio;
    imgHeight *= ratio;
    const x = (pageWidth - imgWidth) / 2;
    const y = (pageHeight - imgHeight) / 2;

    if (!isFirstPage) {
      doc.addPage();
    }

    const imageType = photo.type === 'image/png' ? 'PNG' : 'JPEG';
    doc.addImage(dataUrl, imageType, x, y, imgWidth, imgHeight);
  };

  const handleDownloadPacket = async () => {
    setError('');
    const selectedPhotos = photos.filter((photo) => photo.selected);
    if (!selectedPhotos.length) {
      setError('Select at least one photo before downloading the packet.');
      return;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    try {
      for (let index = 0; index < selectedPhotos.length; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await addPhotoPage(doc, selectedPhotos[index], index === 0);
      }
      doc.save(`${packetName || 'photo-packet'}.pdf`);
    } catch (downloadError) {
      setError('Unable to generate the PDF packet. Please try again with fewer photos.');
      // eslint-disable-next-line no-console
      console.error(downloadError);
    }
  };

  const addContact = () => {
    const { name, phone, email } = contactForm;
    if (!name.trim()) {
      setError('Contact name is required.');
      return;
    }

    const newContact = {
      id: `${name}-${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
    };

    console.log('Adding contact:', newContact);
    setContacts((current) => {
      const updated = [newContact, ...current];
      console.log('Updated contacts:', updated);
      return updated;
    });
    setContactForm({ name: '', phone: '', email: '' });
    setError('');
  };

  const removeContact = (id) => setContacts((current) => current.filter((contact) => contact.id !== id));

  const exportContactsPDF = () => {
    console.log('Exporting contacts, count:', contacts.length);
    if (!contacts.length) {
      setError('No contacts to export.');
      return;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Contacts', 14, 20);
    doc.setFontSize(11);
    let y = 30;

    contacts.forEach((contact, index) => {
      const line = `${index + 1}. ${contact.name}${contact.phone ? ` | ${contact.phone}` : ''}${contact.email ? ` | ${contact.email}` : ''}`;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, 14, y);
      y += 8;
    });

    doc.save('contacts.pdf');
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl shadow-slate-950/50">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-cyan-400/80">Photo Packet Builder</p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Import gallery photos and download complete packets</h1>
            <p className="mt-3 max-w-2xl text-slate-400">Select gallery images, preview the packet, and export a PDF containing every selected photo.</p>
          </div>

          <div className="grid gap-3 sm:w-[320px]">
            <label className="block rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                <FilePlus className="h-4 w-4 text-cyan-300" /> Import photos
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileInput}
                className="h-10 w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950/90 text-sm text-slate-100 file:cursor-pointer file:rounded-2xl file:border-0 file:bg-cyan-500 file:px-4 file:py-2 file:text-slate-950 file:font-semibold hover:file:bg-cyan-400"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleDownloadPacket}
                className="inline-flex items-center justify-center rounded-3xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-xl shadow-cyan-500/20 transition hover:bg-cyan-400"
              >
                <Download className="mr-2 h-4 w-4" /> Download packet
              </button>
              <button
                type="button"
                onClick={clearGallery}
                className="inline-flex items-center justify-center rounded-3xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Clear gallery
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-800 bg-slate-950/90 p-4">
              <div>
                <p className="text-sm text-slate-400">Packet filename</p>
                <input
                  value={packetName}
                  onChange={(event) => setPacketName(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400"
                  placeholder="photo-packet"
                />
              </div>

              <div className="text-right">
                <p className="text-sm text-slate-400">Selected</p>
                <p className="mt-2 text-2xl font-semibold text-white">{selectedCount} / {photos.length}</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-3xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            <div className="grid gap-4">
              {photos.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/80 p-12 text-center text-slate-500">
                  <Image className="mx-auto h-12 w-12 text-slate-500" />
                  <p className="mt-4 text-lg font-medium text-slate-200">No photos imported yet.</p>
                  <p className="mt-2 text-sm text-slate-500">Use the button above to import gallery images and build your packet.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {photos.map((photo) => (
                    <article
                      key={photo.id}
                      className="group overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/90 shadow-xl shadow-slate-950/10 transition hover:border-cyan-500/40"
                    >
                      <div className="relative h-48 overflow-hidden bg-slate-900">
                        <img src={photo.src} alt={photo.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h2 className="truncate text-sm font-semibold text-slate-100">{photo.name}</h2>
                            <p className="mt-1 text-xs text-slate-500">{(photo.file.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleSelect(photo.id)}
                            className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                              photo.selected ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {photo.selected ? 'Selected' : 'Select'}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.id)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-rose-500/40 hover:text-rose-200"
                        >
                          Remove photo
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-6 rounded-3xl border border-slate-800 bg-slate-950/90 p-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-slate-300">
              <h2 className="text-lg font-semibold text-white">Contacts</h2>
              <p className="mt-2 text-sm text-slate-400">Add and manage contacts. Contacts are saved locally in your browser. ({contacts.length} saved)</p>
              <div className="mt-4 grid gap-2">
                <input
                  placeholder="Name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm((s) => ({ ...s, name: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none"
                />
                <input
                  placeholder="Phone"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm((s) => ({ ...s, phone: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none"
                />
                <input
                  placeholder="Email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((s) => ({ ...s, email: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addContact}
                    className="inline-flex items-center justify-center rounded-3xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                  >
                    Add contact
                  </button>
                  {contacts.length > 0 && (
                    <button
                      type="button"
                      onClick={exportContactsPDF}
                      className="inline-flex items-center justify-center rounded-3xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
                    >
                      <Download className="mr-2 h-4 w-4" /> Export PDF
                    </button>
                  )}
                </div>
              </div>
              {contacts.length > 0 && (
                <div className="mt-4 space-y-2">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 px-3 py-2">
                      <div className="truncate text-sm">
                        <div className="font-semibold text-slate-100">{contact.name}</div>
                        <div className="text-xs text-slate-500">
                          {contact.phone}
                          {contact.email ? ` • ${contact.email}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeContact(contact.id)}
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 transition hover:border-rose-500/40 hover:text-rose-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-slate-300">
              <h2 className="text-lg font-semibold text-white">Packet preview</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                This preview shows the gallery state and selection count. When you click Download packet, every selected photo is added to the generated PDF in order.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 text-center">
              <h3 className="mb-4 text-sm uppercase tracking-[0.22em] text-cyan-300/90">Packet QR summary</h3>
              <div className="mx-auto w-fit rounded-3xl bg-slate-950 p-4 shadow-inner shadow-slate-950/30">
                <QRCodeSVG value={packetQrValue} size={152} bgColor="#0f172a" fgColor="#38bdf8" />
              </div>
              <p className="mt-4 text-sm text-slate-400">Scan for a quick packet summary.</p>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

export default App;
