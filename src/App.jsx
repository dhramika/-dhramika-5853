import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { QRCodeSVG } from "qrcode.react";
import {
  Download,
  MapPin,
  Trash2,
  Settings,
  Home,
  Mail,
  Save,
  HelpCircle,
  Bookmark,
  QrCode,
  Image,
  Calendar,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Share2,
  X,
  Phone,
  Smartphone,
  ExternalLink,
  Plus,
  UserPlus,
  Pencil,
} from "lucide-react";

// Minimal UI components so the preview works without external UI libraries
const Card = ({ className = "", children }) => <div className={className}>{children}</div>;
const CardContent = ({ className = "", children }) => <div className={className}>{children}</div>;

const Button = ({ children, className = "", variant = "default", ...props }) => {
  let base = "flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-2xl";
  if (variant === "outline") base += " border";
  if (variant === "secondary") base += " bg-white border";
  if (variant === "destructive") base += " bg-red-600 text-white";
  if (variant === "default") base += " bg-[#0B3A5B] text-white";
  return (
    <button className={`${base} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Input = (props) => (
  <input
    {...props}
    className={`w-full border rounded-xl px-3 py-2 ${props.className || ""}`}
  />
);

const Label = ({ children }) => <div className="text-xs font-semibold">{children}</div>;
const Badge = ({ children, className = "" }) => (
  <div className={`px-2 py-1 text-xs font-semibold rounded-full ${className}`}>
    {children}
  </div>
);

const DRAFT_KEY = "code-compliance-field-app-draft-v2";
const SETTINGS_KEY = "code-compliance-field-app-settings-v2";
const GALLERY_KEY = "code-compliance-field-app-gallery-v1";
const SAVED_PDFS_KEY = "code-compliance-field-app-pdfs-v1";
const CONTACTS_KEY = "code-compliance-field-app-contacts-v1";


function formatDateTime(date) {
  const d = new Date(date);
  return {
    date: d.toLocaleDateString(),
    time: d.toLocaleTimeString(),
    iso: d.toISOString(),
  };
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    const parsed = JSON.parse(value);
    // Integrity check: reject data whose shape doesn't match the expected
    // fallback type. Protects against corrupted or tampered storage entries
    // (e.g. a non-array where an array is expected) crashing the app.
    if (Array.isArray(fallback) && !Array.isArray(parsed)) {
      console.warn('[v0] Discarded stored value: expected array, got', typeof parsed);
      return fallback;
    }
    if (
      fallback !== null &&
      typeof fallback === 'object' &&
      !Array.isArray(fallback) &&
      (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    ) {
      console.warn('[v0] Discarded stored value: expected object, got', typeof parsed);
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

// Polyfill for crypto.randomUUID (not available in all Android browsers)
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Safe localStorage wrapper for Android WebView compatibility
const safeStorage = {
  getItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn('localStorage not available:', e);
    }
    return null;
  },
  setItem: (key, value) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return true;
      }
    } catch (e) {
      console.warn('localStorage not available:', e);
    }
    return false;
  },
  removeItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return true;
      }
    } catch (e) {
      console.warn('localStorage not available:', e);
    }
    return false;
  }
};

// IndexedDB wrapper for storing large photo data (survives phone lock/page refresh)
const PHOTO_DB_NAME = 'code-compliance-photos-db';
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE_NAME = 'photos';

const photoDatabase = {
  db: null,
  
  async open() {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('[v0] IndexedDB not available');
        resolve(null);
        return;
      }
      
      const request = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
      
      request.onerror = () => {
        console.warn('[v0] IndexedDB error:', request.error);
        resolve(null);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[v0] IndexedDB opened successfully');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
          db.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'key' });
          console.log('[v0] IndexedDB store created');
        }
      };
    });
  },
  
  async savePhotos(photos) {
    try {
      const db = await this.open();
      if (!db) {
        console.log('[v0] IndexedDB unavailable, using localStorage fallback');
        try {
          safeStorage.setItem(DRAFT_KEY + '-photos', JSON.stringify(photos));
        } catch (e) {
          console.warn('[v0] localStorage fallback failed:', e);
        }
        return;
      }
      
      return new Promise((resolve) => {
        const transaction = db.transaction([PHOTO_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PHOTO_STORE_NAME);
        
        const request = store.put({ key: 'current-session-photos', photos, savedAt: new Date().toISOString() });
        
        request.onsuccess = () => {
          console.log('[v0] Photos saved to IndexedDB successfully, count:', photos.length);
          resolve();
        };
        request.onerror = () => {
          console.warn('[v0] IndexedDB save error:', request.error);
          try {
            safeStorage.setItem(DRAFT_KEY + '-photos', JSON.stringify(photos));
          } catch (e) {
            console.warn('[v0] localStorage fallback failed:', e);
          }
          resolve();
        };
      });
    } catch (e) {
      console.warn('[v0] IndexedDB save exception:', e);
    }
  },
  
  async loadPhotos() {
    try {
      const db = await this.open();
      if (!db) {
        console.log('[v0] IndexedDB unavailable for load, trying localStorage');
        const stored = safeStorage.getItem(DRAFT_KEY + '-photos');
        return stored ? safeJsonParse(stored, []) : [];
      }
      
      return new Promise((resolve) => {
        const transaction = db.transaction([PHOTO_STORE_NAME], 'readonly');
        const store = transaction.objectStore(PHOTO_STORE_NAME);
        
        const request = store.get('current-session-photos');
        
        request.onsuccess = () => {
          const result = request.result;
          if (result && result.photos) {
            console.log('[v0] Photos loaded from IndexedDB, count:', result.photos.length);
            resolve(result.photos);
          } else {
            console.log('[v0] No photos in IndexedDB, trying localStorage');
            const stored = safeStorage.getItem(DRAFT_KEY + '-photos');
            resolve(stored ? safeJsonParse(stored, []) : []);
          }
        };
        
        request.onerror = () => {
          console.warn('[v0] IndexedDB load error:', request.error);
          const stored = safeStorage.getItem(DRAFT_KEY + '-photos');
          resolve(stored ? safeJsonParse(stored, []) : []);
        };
      });
    } catch (e) {
      console.warn('[v0] IndexedDB load exception:', e);
      const stored = safeStorage.getItem(DRAFT_KEY + '-photos');
      return stored ? safeJsonParse(stored, []) : [];
    }
  },
  
  async clearPhotos() {
    try {
      const db = await this.open();
      if (db) {
        const transaction = db.transaction([PHOTO_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PHOTO_STORE_NAME);
        store.delete('current-session-photos');
        console.log('[v0] Photos cleared from IndexedDB');
      }
      safeStorage.removeItem(DRAFT_KEY + '-photos');
    } catch (e) {
      console.warn('[v0] IndexedDB clear exception:', e);
      safeStorage.removeItem(DRAFT_KEY + '-photos');
    }
  }
};

function downloadFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function stampImage(src, overlay) {
  // Return the original image without any stamp overlay
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not available."));
        return;
      }

      ctx.drawImage(img, 0, 0);

      // Use standard quality for balanced file size and clarity
      resolve(canvas.toDataURL("image/jpeg", 0.80));
    };
    img.onerror = () => reject(new Error("Unable to load image."));
    img.src = src;
  });
}

async function createCasePdfBlob({ officer, gps, photos, caseNumber }) {
  console.log("[v0] createCasePdfBlob started with", photos.length, "photos");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Photos only - no cover page, each photo on its own page
  let isFirstImage = true;
  
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const imageData = photo.stamped || photo.original;
    
    if (!imageData) {
      console.log("[v0] Skipping photo", index + 1, "- no image data");
      continue;
    }
    
    console.log("[v0] Processing photo", index + 1, "of", photos.length);
    
    // Load image to get dimensions
    let imgWidth = 612; // Default letter width
    let imgHeight = 792; // Default letter height
    
    try {
      const img = new window.Image();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log("[v0] Image load timeout for photo", index + 1);
          resolve(); // Continue anyway with defaults
        }, 5000);
        
        img.onload = () => {
          clearTimeout(timeout);
          imgWidth = img.width;
          imgHeight = img.height;
          console.log("[v0] Image loaded:", index + 1, imgWidth, "x", imgHeight);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(timeout);
          console.log("[v0] Image error for photo", index + 1, "- using defaults");
          resolve(); // Continue anyway
        };
        img.src = imageData;
      });
    } catch (e) {
      console.log("[v0] Exception loading image", index + 1, e);
    }

    // First image uses the initial page, subsequent images get new pages
    if (isFirstImage) {
      isFirstImage = false;
    } else {
      doc.addPage();
    }
    
    // Calculate dimensions to maintain aspect ratio
    const imgAspect = imgWidth / imgHeight;
    const pageAspect = pageWidth / pageHeight;
    
    let drawWidth, drawHeight, drawX, drawY;
    
    if (imgAspect > pageAspect) {
      // Image is wider than page - fit to width
      drawWidth = pageWidth;
      drawHeight = pageWidth / imgAspect;
      drawX = 0;
      drawY = (pageHeight - drawHeight) / 2;
    } else {
      // Image is taller than page - fit to height
      drawHeight = pageHeight;
      drawWidth = pageHeight * imgAspect;
      drawX = (pageWidth - drawWidth) / 2;
      drawY = 0;
    }
    
    // Add image centered with correct aspect ratio
    try {
      doc.addImage(imageData, "JPEG", drawX, drawY, drawWidth, drawHeight, undefined, "FAST");
      console.log("[v0] Added image to PDF:", index + 1);
    } catch (e) {
      console.log("[v0] Failed to add image to PDF:", index + 1, e);
    }
  }

  console.log("[v0] PDF generation complete, outputting blob");
  return doc.output("blob");
}



export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const nativeCameraInputRef = useRef(null);
  const batchImportInputRef = useRef(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [photosTaken, setPhotosTaken] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeTab, setActiveTab] = useState("field");
  const [officer, setOfficer] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const formatCaseNumber = (value) => {
    if (!value) return "";
    const cleaned = value.replace(/^Code-/i, "");
    return `Code-${cleaned}`;
  };
  const [gps, setGps] = useState("");
  const [status, setStatus] = useState("Ready for field use");
  const [photos, setPhotos] = useState([]);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [isSharingToOneDrive, setIsSharingToOneDrive] = useState(false);
  const [gallery, setGallery] = useState([]);
  const [expandedCases, setExpandedCases] = useState({});
  const [savedPdfs, setSavedPdfs] = useState([]);
  const [viewingPhoto, setViewingPhoto] = useState(null); // For full-screen photo viewer
  const [isLandscape, setIsLandscape] = useState(false); // Track orientation for camera controls
  // Default contacts data
  const defaultContacts = [
    { id: "default-1", title: "Wetlands", organization: "Natural Resources", contactPerson: "Myranda Cravotta", notes: "Any lands with water questions", phone: "727-992-2173", email: "", isDefault: true },
    { id: "default-2", title: "Cell Towers / FDOT Right-of-Way", organization: "Vertical Bridge REIT, LLC", contactPerson: "David Callender - Director, Advocacy and Zoning", notes: "", phone: "919-524-0273", email: "David.callender@verticalbridge.com", isDefault: true },
    { id: "default-3", title: "County Owned Lands", organization: "Facilities", contactPerson: "Heather Wolf", notes: "County parcels that have violations", phone: "727-809-6612", email: "hwolff@pascocountyfl.net", isDefault: true },
    { id: "default-4", title: "Zoning", organization: "Zoning Division", contactPerson: "Ruthann Dattoli", notes: "Zoning information", phone: "727-847-8142 ext. 8559", email: "rdattoli@mypasco.net", isDefault: true },
    { id: "default-5", title: "Trespass Agreements", organization: "PCSO", contactPerson: "Frank Lewars", notes: "", phone: "", email: "flewars@pascosheriff.org", isDefault: true },
    { id: "default-6", title: "AG Exemption", organization: "Property Appraiser", contactPerson: "", notes: "", phone: "727-847-8142 ext. 7260", email: "", isDefault: true },
    { id: "default-7", title: "Septic Tanks", organization: "Florida Dept. Of Health", contactPerson: "", notes: "", phone: "727-841-4425 ext. 5", email: "", isDefault: true },
    { id: "default-8", title: "Sign Request / Questions", organization: "Central Permitting", contactPerson: "Ron Garrido", notes: "", phone: "727-847-8126 ext. 7571", email: "rgarrido@pascocountyfl.net", isDefault: true },
    { id: "default-9", title: "Site Plan", organization: "Current Planning", contactPerson: "Tech of the Day", notes: "", phone: "727-847-8142 ext. 8643", email: "", isDefault: true },
    { id: "default-10", title: "Trees Permit", organization: "Central Permitting", contactPerson: "Mike Woodard", notes: "", phone: "727-847-8126 ext. 7290", email: "treeremovalpermits@pasocountyfl.net", isDefault: true },
    { id: "default-11", title: "Non Emergency Number (911)", organization: "Dispatcher", contactPerson: "", notes: "Non-emergency phone number for 911 / dispatch", phone: "727-847-8102", email: "", isDefault: true, highlighted: true },
  ];

  const [contacts, setContacts] = useState(defaultContacts); // All contacts (default + custom)
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null); // Contact being edited
  const [newContact, setNewContact] = useState({
    title: "",
    organization: "",
    contactPerson: "",
    notes: "",
    phone: "",
    email: ""
  });
  
  // Detect orientation changes
  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    
    checkOrientation(); // Check initial orientation
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);
    
    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);
  
  const [settings, setSettings] = useState({
    officerDefault: "",
    tenantLabel: "Pasco County Code Compliance",
  });

  const totals = useMemo(() => ({ photoCount: photos.length }), [photos]);

  useEffect(() => {
    const loadSavedData = async () => {
      console.log('[v0] Starting to load saved data...');
      
      const savedSettings = safeJsonParse(safeStorage.getItem(SETTINGS_KEY), null);
      if (savedSettings) {
        setSettings((prev) => ({ ...prev, ...savedSettings }));
        setOfficer(savedSettings.officerDefault || "");
      }

      const savedDraft = safeJsonParse(safeStorage.getItem(DRAFT_KEY), null);
      if (savedDraft) {
        setOfficer(savedDraft.officer || savedSettings?.officerDefault || "");
        setGps(savedDraft.gps || "");
        setCaseNumber(savedDraft.caseNumber || "");
      }

      // Load photos from IndexedDB (persists even when phone locks)
      console.log('[v0] Loading photos from IndexedDB...');
      const savedPhotos = await photoDatabase.loadPhotos();
      if (savedPhotos && savedPhotos.length > 0) {
        console.log('[v0] Restoring photos from IndexedDB, count:', savedPhotos.length);
        setPhotos(savedPhotos);
        setStatus(`Recovered ${savedPhotos.length} photo(s) from saved session.`);
      } else if (savedDraft?.photos && savedDraft.photos.length > 0) {
        // Fallback: try loading from the old draft format
        console.log('[v0] Restoring photos from localStorage draft fallback, count:', savedDraft.photos.length);
        setPhotos(savedDraft.photos);
        // Migrate to IndexedDB
        photoDatabase.savePhotos(savedDraft.photos);
        setStatus("Recovered saved field draft.");
      } else {
        console.log('[v0] No saved photos found');
      }

      // Load gallery from storage
      const savedGallery = safeJsonParse(safeStorage.getItem(GALLERY_KEY), []);
      if (savedGallery && savedGallery.length > 0) {
        setGallery(savedGallery);
      }

      // Load saved PDFs from storage
      const loadedPdfs = safeJsonParse(safeStorage.getItem(SAVED_PDFS_KEY), []);
      if (loadedPdfs && loadedPdfs.length > 0) {
        setSavedPdfs(loadedPdfs);
      }
      
      // Load contacts from storage (merges with defaults)
      const loadedContacts = safeJsonParse(safeStorage.getItem(CONTACTS_KEY), []);
      if (loadedContacts && loadedContacts.length > 0) {
        setContacts(loadedContacts);
      }
    };
    
    loadSavedData();
  }, []);

  useEffect(() => {
    if (!settingsSaved) return;
    const timer = setTimeout(() => setSettingsSaved(false), 1600);
    return () => clearTimeout(timer);
  }, [settingsSaved]);

  // Auto-save case number, officer, and GPS to localStorage (small data)
  useEffect(() => {
    const draft = {
      officer,
      gps,
      caseNumber,
      savedAt: new Date().toISOString(),
    };
    safeStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [caseNumber, officer, gps]);

  // Auto-save photos to IndexedDB (large data - survives phone lock)
  useEffect(() => {
    if (photos.length > 0) {
      console.log('[v0] Auto-saving photos to IndexedDB, count:', photos.length);
      photoDatabase.savePhotos(photos);
    }
  }, [photos]);

  // Auto-save gallery whenever it changes
  useEffect(() => {
    if (gallery.length > 0) {
      safeStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
    }
  }, [gallery]);

  // Function to add photos to gallery (called when OneDrive button is pushed)
  const addPhotosToGallery = (photosToAdd) => {
    setGallery((prevGallery) => {
      const existingIds = new Set(prevGallery.map((p) => p.id));
      const newPhotos = photosToAdd.filter((p) => !existingIds.has(p.id));
      if (newPhotos.length === 0) return prevGallery;
      return [...newPhotos, ...prevGallery];
    });
  };

  // Function to remove photo from gallery
  const removePhotoFromGallery = (id) => {
    setGallery((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      if (updated.length === 0) {
        safeStorage.removeItem(GALLERY_KEY);
      }
      return updated;
    });
  };

  // Group gallery photos by case number and date
  const groupedGallery = useMemo(() => {
    const groups = {};
    gallery.forEach((photo) => {
      const caseKey = photo.caseNumber || "No Case Number";
      const dateKey = new Date(photo.createdAt).toLocaleDateString();
      const groupKey = `${caseKey}|||${dateKey}`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          caseNumber: photo.caseNumber || "No Case Number",
          date: dateKey,
          photos: [],
        };
      }
      groups[groupKey].photos.push(photo);
    });
    
    // Sort groups by date (newest first)
    return Object.values(groups).sort((a, b) => {
      const dateA = new Date(a.photos[0].createdAt);
      const dateB = new Date(b.photos[0].createdAt);
      return dateB - dateA;
    });
  }, [gallery]);

  // Toggle case expansion in gallery
  const toggleCaseExpand = (caseKey) => {
    setExpandedCases((prev) => ({
      ...prev,
      [caseKey]: !prev[caseKey],
    }));
  };

  // Auto-save PDFs whenever they change
  useEffect(() => {
    console.log("[v0] savedPdfs useEffect triggered, count:", savedPdfs.length);
    if (savedPdfs.length > 0) {
      console.log("[v0] Saving PDFs to storage:", savedPdfs.map(p => p.fileName));
      safeStorage.setItem(SAVED_PDFS_KEY, JSON.stringify(savedPdfs));
    }
  }, [savedPdfs]);

  // Auto-save contacts whenever they change
  useEffect(() => {
    if (contacts.length > 0) {
      safeStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
    }
  }, [contacts]);

  // Function to add a new contact
  const addContact = () => {
    if (!newContact.title.trim()) {
      setStatus("Please enter a title for the contact");
      return;
    }
    const contact = {
      ...newContact,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      isDefault: false
    };
    setContacts((prev) => [...prev, contact]);
    setNewContact({
      title: "",
      organization: "",
      contactPerson: "",
      notes: "",
      phone: "",
      email: ""
    });
    setShowAddContactModal(false);
    setStatus("Contact added successfully");
  };

  // Function to delete a contact
  const deleteContact = (id) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setStatus("Contact deleted");
  };

  // Function to export all contacts to a PDF file
  const exportContactsToPDF = () => {
    if (contacts.length === 0) {
      setStatus("No contacts to export");
      return;
    }
    setStatus("Generating contacts PDF...");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 48;
    const marginBottom = 56;
    let y = 56;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(11, 58, 91); // #0B3A5B
    doc.text("Contact Directory", marginX, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(108, 125, 138); // #6C7D8A
    doc.text(`Exported ${new Date().toLocaleString()}`, marginX, y);
    y += 14;
    doc.setDrawColor(11, 58, 91);
    doc.setLineWidth(1);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 24;

    const ensureSpace = (needed) => {
      if (y + needed > pageHeight - marginBottom) {
        doc.addPage();
        y = 56;
      }
    };

    contacts.forEach((contact) => {
      // Estimate block height
      let lines = 1;
      if (contact.organization) lines++;
      if (contact.contactPerson) lines++;
      if (contact.notes) lines++;
      if (contact.phone) lines++;
      if (contact.email) lines++;
      ensureSpace(lines * 15 + 16);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(11, 58, 91);
      doc.text(contact.title || "Untitled", marginX, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      if (contact.organization) {
        doc.setTextColor(108, 125, 138);
        doc.text(contact.organization, marginX, y);
        y += 14;
      }
      if (contact.contactPerson) {
        doc.setTextColor(79, 100, 117); // #4F6475
        doc.text(contact.contactPerson, marginX, y);
        y += 14;
      }
      if (contact.notes) {
        doc.setTextColor(108, 125, 138);
        doc.setFont("helvetica", "italic");
        const noteLines = doc.splitTextToSize(contact.notes, pageWidth - marginX * 2);
        doc.text(noteLines, marginX, y);
        y += 14 * noteLines.length;
        doc.setFont("helvetica", "normal");
      }
      if (contact.phone) {
        doc.setTextColor(79, 100, 117);
        doc.text(`Phone: ${contact.phone}`, marginX, y);
        y += 14;
      }
      if (contact.email) {
        doc.setTextColor(11, 58, 91);
        doc.text(`Email: ${contact.email}`, marginX, y);
        y += 14;
      }

      y += 10;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 16;
    });

    const fileName = `contacts-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
    setStatus("Contacts exported to PDF");
  };

  // Function to start editing a contact
  const startEditContact = (contact) => {
    setEditingContact(contact);
    setNewContact({
      title: contact.title || "",
      organization: contact.organization || "",
      contactPerson: contact.contactPerson || "",
      notes: contact.notes || "",
      phone: contact.phone || "",
      email: contact.email || ""
    });
    setShowAddContactModal(true);
  };

  // Function to save edited contact
  const saveEditedContact = () => {
    if (!newContact.title.trim()) {
      setStatus("Please enter a title for the contact");
      return;
    }
    setContacts((prev) =>
      prev.map((c) =>
        c.id === editingContact.id
          ? { ...c, ...newContact, updatedAt: new Date().toISOString() }
          : c
      )
    );
    setEditingContact(null);
    setNewContact({
      title: "",
      organization: "",
      contactPerson: "",
      notes: "",
      phone: "",
      email: ""
    });
    setShowAddContactModal(false);
    setStatus("Contact updated successfully");
  };

  // Function to close contact modal and reset state
  const closeContactModal = () => {
    setShowAddContactModal(false);
    setEditingContact(null);
    setNewContact({
      title: "",
      organization: "",
      contactPerson: "",
      notes: "",
      phone: "",
      email: ""
    });
  };

  // Function to save PDF to gallery
  const savePdfToGallery = (pdfData) => {
    console.log("[v0] savePdfToGallery called with:", pdfData.fileName, pdfData.caseNumber, pdfData.photoCount);
    setSavedPdfs((prev) => {
      console.log("[v0] Previous savedPdfs count:", prev.length);
      const newPdfs = [pdfData, ...prev];
      console.log("[v0] New savedPdfs count:", newPdfs.length);
      return newPdfs;
    });
  };

  // Function to remove PDF from gallery
  const removePdfFromGallery = (id) => {
    setSavedPdfs((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      if (updated.length === 0) {
        safeStorage.removeItem(SAVED_PDFS_KEY);
      }
      return updated;
    });
  };

// Function to open/view a saved PDF
  const openPdf = (pdfRecord) => {
    try {
      if (!pdfRecord.pdfBase64) {
        setStatus("PDF data not available");
        return;
      }
      // Convert base64 back to blob and open in new tab
      const byteCharacters = atob(pdfRecord.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
      setStatus("PDF opened");
    } catch (error) {
      setStatus("Unable to open PDF: " + error.message);
    }
  };

  // Function to re-download a saved PDF
  const redownloadPdf = async (pdfRecord) => {
    try {
      if (!pdfRecord.pdfBase64) {
        setStatus("PDF data not available");
        return;
      }
      // Convert base64 back to blob
      const byteCharacters = atob(pdfRecord.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });
      
      // Download the PDF
      downloadFile(pdfRecord.fileName, pdfBlob, "application/pdf");
      
      // Try to open share sheet
      const pdfFile = new File([pdfBlob], pdfRecord.fileName, { type: "application/pdf" });
      const canNativeShare = navigator.canShare && navigator.canShare({ files: [pdfFile] });
      if (canNativeShare && navigator.share) {
        await navigator.share({
          files: [pdfFile],
          title: pdfRecord.fileName,
          text: "Save this PDF to OneDrive.",
        });
        setStatus(`PDF downloaded and share sheet opened.`);
      } else {
        setStatus(`PDF saved to Downloads. Share to OneDrive from Files app.`);
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        setStatus("PDF saved to Downloads. Share canceled.");
      } else {
        setStatus("Error re-downloading PDF.");
      }
    }
  };

  const detectLocation = (showStatus = true) =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        if (showStatus) setStatus("Geolocation not supported on this device/browser.");
        resolve();
        return;
      }
      if (showStatus) setStatus("Getting GPS location...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(6);
          const lon = pos.coords.longitude.toFixed(6);
          setGps(`${lat}, ${lon}`);
          if (showStatus) setStatus("GPS captured.");
          resolve();
        },
        () => {
          if (showStatus) setStatus("Unable to retrieve GPS location.");
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  const captureFieldMetadata = async () => {
    await detectLocation();
  };

  useEffect(() => {
    captureFieldMetadata();
    
    // Auto-refresh GPS every 30 seconds
    const gpsInterval = setInterval(() => {
      detectLocation(false); // Silent update (no status message)
    }, 30000);
    
    return () => clearInterval(gpsInterval);
  }, []);

  // In-app camera functions
  const openCamera = async () => {
    try {
      setStatus("Opening camera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment", 
          width: { ideal: 4096 }, 
          height: { ideal: 2160 }
        },
        audio: false
      });
      setCameraStream(stream);
      setShowCamera(true);
      setPhotosTaken(0);
      setZoomLevel(1);
      setStatus("Camera ready. Tap to capture photos.");
    } catch (error) {
      setStatus("Unable to access camera. Please check permissions.");
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
    if (photosTaken > 0) {
      setStatus(`${photosTaken} photo(s) captured.`);
    }
  };

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    // Calculate crop region based on zoom level
    const fullWidth = video.videoWidth;
    const fullHeight = video.videoHeight;
    const cropWidth = Math.round(fullWidth / zoomLevel);
    const cropHeight = Math.round(fullHeight / zoomLevel);
    const cropX = Math.round((fullWidth - cropWidth) / 2);
    const cropY = Math.round((fullHeight - cropHeight) / 2);
    
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.80);
    const meta = formatDateTime(new Date());
    const currentGps = gps;
    
    captureFieldMetadata();
    
    const stamped = await stampImage(imageDataUrl, {
      caseNumber,
      officer,
      date: meta.date,
      time: meta.time,
      gps: currentGps,
    });
    
    const newPhoto = {
      id: generateUUID(),
      fileName: `photo_${Date.now()}.jpg`,
      original: imageDataUrl,
      stamped,
      createdAt: meta.iso,
      officer,
      gps: currentGps,
      caseNumber,
    };
    
    setPhotos((prev) => [newPhoto, ...prev]);
    setPhotosTaken((prev) => prev + 1);
    
    // Auto-save photo to phone gallery via download
    try {
      const arr = stamped.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      
      const fileName = `${caseNumber || 'photo'}_${Date.now()}.jpg`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      // Silent fail - photo still saved in app gallery
    }
  };

  const removePhoto = (id) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  // Handle photo from native phone camera
  const handleNativeCameraCapture = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setStatus("Processing photo...");
    
    try {
      const imageDataUrl = await toDataUrl(file);
      const meta = formatDateTime(new Date());
      const currentGps = gps;
      
      // Refresh GPS before stamping
      captureFieldMetadata();
      
      const stamped = await stampImage(imageDataUrl, {
        caseNumber,
        officer,
        date: meta.date,
        time: meta.time,
        gps: currentGps,
      });
      
      const newPhoto = {
        id: generateUUID(),
        fileName: `photo_${Date.now()}.jpg`,
        original: imageDataUrl,
        stamped,
        createdAt: meta.iso,
        officer,
        gps: currentGps,
        caseNumber,
      };
      
      setPhotos((prev) => [newPhoto, ...prev]);
      setStatus(`Photo captured and stamped! (${photos.length + 1} total)`);
      
      // Auto-save stamped photo to phone gallery via download
      try {
        const arr = stamped.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        
        const fileName = `${caseNumber || 'photo'}_${Date.now()}.jpg`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        // Silent fail - photo still saved in app
      }
    } catch (error) {
      setStatus("Error processing photo. Please try again.");
    }
    
    // Reset file input so same file can be selected again
    event.target.value = '';
  };

  // Handle batch import of multiple photos from gallery
  const handleBatchImport = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    setStatus(`Importing ${files.length} photo(s)...`);
    
    const newPhotos = [];
    let successCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Processing photo ${i + 1} of ${files.length}...`);
      
      try {
        const imageDataUrl = await toDataUrl(file);
        const meta = formatDateTime(new Date());
        const currentGps = gps;
        
        const stamped = await stampImage(imageDataUrl, {
          caseNumber,
          officer,
          date: meta.date,
          time: meta.time,
          gps: currentGps,
        });
        
        const newPhoto = {
          id: generateUUID(),
          fileName: file.name || `photo_${Date.now()}.jpg`,
          original: imageDataUrl,
          stamped,
          createdAt: meta.iso,
          officer,
          gps: currentGps,
          caseNumber,
        };
        
        newPhotos.push(newPhoto);
        successCount++;
      } catch (error) {
        console.warn(`Failed to process photo ${i + 1}:`, error);
      }
    }
    
    if (newPhotos.length > 0) {
      setPhotos((prev) => [...newPhotos, ...prev]);
      setStatus(`Imported and stamped ${successCount} photo(s)!`);
    } else {
      setStatus("Failed to import photos. Please try again.");
    }
    
    // Reset file input
    event.target.value = '';
  };

  const saveSettings = () => {
    safeStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setOfficer(settings.officerDefault || officer);
    setSettingsSaved(true);
    setStatus("Settings saved.");
  };

  

// Helper function to convert base64 data URL to Blob
  const dataURLtoBlob = (dataURL) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  // Save Photo Pack by Date and Time - saves PDF to phone gallery
  const savePhotoPackByDateTime = async () => {
    if (photos.length === 0) {
      alert("Please add at least one photo first");
      return;
    }
    
    setIsSharingToOneDrive(true);
    
    try {
      // Sort photos by date/time (oldest first for chronological order in PDF)
      const sortedPhotos = [...photos].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      // Generate filename with date and time
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      }).replace(/:/g, '-'); // HH-MM-SS
      const fileBase = caseNumber || "PhotoPack";
      const pdfFileName = `${fileBase}_${dateStr}_${timeStr}.pdf`;
      
      setStatus("Creating PDF sorted by date/time...");
      
      // Create PDF with jsPDF - photos only, no cover page
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Add each photo on its own page (sorted by date/time)
      let addedCount = 0;
      for (let i = 0; i < sortedPhotos.length; i++) {
        setStatus(`Adding photo ${i + 1} of ${sortedPhotos.length} (sorted by date/time)...`);
        const photo = sortedPhotos[i];
        const imageData = photo.stamped || photo.original;
        
        if (imageData) {
          try {
            // First image uses the initial page, subsequent images get new pages
            if (addedCount > 0) {
              doc.addPage();
            }
            
            // Load image to get dimensions and maintain aspect ratio
            const img = new window.Image();
            await new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
              img.src = imageData;
            });
            
            const imgWidth = img.width || pageWidth;
            const imgHeight = img.height || pageHeight;
            const imgAspect = imgWidth / imgHeight;
            const pageAspect = pageWidth / pageHeight;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (imgAspect > pageAspect) {
              // Image is wider than page - fit to width
              drawWidth = pageWidth;
              drawHeight = pageWidth / imgAspect;
              drawX = 0;
              drawY = (pageHeight - drawHeight) / 2;
            } else {
              // Image is taller than page - fit to height
              drawHeight = pageHeight;
              drawWidth = pageHeight * imgAspect;
              drawX = (pageWidth - drawWidth) / 2;
              drawY = 0;
            }
            
            // Add image with correct aspect ratio, centered on page
            try {
              doc.addImage(imageData, "JPEG", drawX, drawY, drawWidth, drawHeight);
            } catch {
              doc.addImage(imageData, "PNG", drawX, drawY, drawWidth, drawHeight);
            }
            addedCount++;
          } catch (imgError) {
            console.log("[v0] Error adding image:", imgError);
          }
        }
      }
      
      if (addedCount === 0) {
        alert("Could not add any photos to PDF. Please try again.");
        setIsSharingToOneDrive(false);
        return;
      }
      
      // Get PDF as blob for sharing
      setStatus("Preparing PDF for gallery save...");
      const pdfBlob = doc.output("blob");
      const pdfFile = new File([pdfBlob], pdfFileName, { type: "application/pdf" });
      
      // Save to internal gallery
      const pdfBase64 = doc.output("datauristring").split(",")[1];
      savePdfToGallery({
        id: generateUUID(),
        fileName: pdfFileName,
        caseNumber: caseNumber || "No Case Number",
        date: dateStr,
        time: now.toLocaleTimeString(),
        photoCount: addedCount,
        officer: officer,
        createdAt: now.toISOString(),
        pdfBase64: pdfBase64,
      });
      
      // Also save photos to gallery backup
      addPhotosToGallery(photos);
      
      // Try native share API first (works on mobile to save to Files/Gallery)
      const canNativeShare = navigator.canShare && navigator.canShare({ files: [pdfFile] });
      
      if (canNativeShare && navigator.share) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: pdfFileName,
            text: `Photo Pack - ${caseNumber || "Photos"} - ${dateStr} ${timeStr}`,
          });
          setStatus(`Photo pack saved! ${addedCount} photos sorted by date/time.`);
        } catch (shareError) {
          if (shareError?.name === "AbortError") {
            setStatus("Share canceled. PDF saved to app gallery.");
          } else {
            // Fallback to download
            downloadFile(pdfFileName, pdfBlob, "application/pdf");
            setStatus(`PDF downloaded. Save from Downloads to your gallery.`);
          }
        }
      } else {
        // Fallback for browsers without share API
        downloadFile(pdfFileName, pdfBlob, "application/pdf");
        setStatus(`PDF saved to Downloads. ${addedCount} photos sorted by date/time.`);
        
        // On mobile, also try to open in new tab for easier saving
        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          const pdfUrl = URL.createObjectURL(pdfBlob);
          window.open(pdfUrl, '_blank');
        }
      }
      
    } catch (error) {
      console.log("[v0] Error in savePhotoPackByDateTime:", error);
      alert("Error creating PDF: " + (error?.message || "Unknown error"));
      setStatus("Error creating PDF");
    } finally {
      setIsSharingToOneDrive(false);
    }
  };

  const exportToOneDrive = async () => {
    if (photos.length === 0) {
      alert("Please add at least one photo first");
      return;
    }
    
    setIsSharingToOneDrive(true);
    
    try {
      // Save to gallery first
      addPhotosToGallery(photos);
      
      const fileBase = caseNumber || "Code-CASE";
      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '');
      const pdfFileName = `${fileBase}_${dateStr}_${timeStr}_photo-packet.pdf`;
      
      // Create PDF - photos only, no cover page
      setStatus("Creating PDF...");
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Add each photo on its own page (maintaining aspect ratio)
      let addedCount = 0;
      for (let i = 0; i < photos.length; i++) {
        setStatus(`Adding photo ${i + 1} of ${photos.length}...`);
        const photo = photos[i];
        const imageData = photo.stamped || photo.original;
        
        if (imageData) {
          try {
            // First image uses the initial page, subsequent images get new pages
            if (addedCount > 0) {
              doc.addPage();
            }
            
            // Load image to get dimensions and maintain aspect ratio
            const img = new window.Image();
            await new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
              img.src = imageData;
            });
            
            const imgWidth = img.width || pageWidth;
            const imgHeight = img.height || pageHeight;
            const imgAspect = imgWidth / imgHeight;
            const pageAspect = pageWidth / pageHeight;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (imgAspect > pageAspect) {
              // Image is wider than page - fit to width
              drawWidth = pageWidth;
              drawHeight = pageWidth / imgAspect;
              drawX = 0;
              drawY = (pageHeight - drawHeight) / 2;
            } else {
              // Image is taller than page - fit to height
              drawHeight = pageHeight;
              drawWidth = pageHeight * imgAspect;
              drawX = (pageWidth - drawWidth) / 2;
              drawY = 0;
            }
            
            // Try adding image - use PNG format as fallback
            try {
              doc.addImage(imageData, "JPEG", drawX, drawY, drawWidth, drawHeight);
            } catch {
              doc.addImage(imageData, "PNG", drawX, drawY, drawWidth, drawHeight);
            }
            addedCount++;
          } catch (imgError) {
            // Skip failed image but continue
          }
        }
      }
      
      if (addedCount === 0) {
        alert("Could not add any photos to PDF. Please try again.");
        setIsSharingToOneDrive(false);
        return;
      }
      
      // Get PDF as blob
      setStatus("Preparing PDF...");
      const pdfBlob = doc.output("blob");
      
      // Save to gallery
      try {
        const pdfBase64 = doc.output("datauristring").split(",")[1];
        savePdfToGallery({
          id: generateUUID(),
          fileName: pdfFileName,
          caseNumber: caseNumber || "No Case Number",
          date: dateStr,
          time: new Date().toLocaleTimeString(),
          photoCount: addedCount,
          officer: officer,
          createdAt: new Date().toISOString(),
          pdfBase64: pdfBase64,
        });
      } catch (e) {
        // Gallery save failed, continue
      }
      
      // Open PDF in new tab - user can then use browser menu to share/save to OneDrive
      setStatus("Opening PDF...");
      const pdfDataUri = doc.output("dataurlstring");
      const newTab = window.open();
      if (newTab) {
        newTab.document.write(`
          <html>
            <head><title>${pdfFileName}</title></head>
            <body style="margin:0;padding:0;display:flex;flex-direction:column;height:100vh;">
              <div style="background:#333;color:white;padding:10px;text-align:center;">
                <strong>${pdfFileName}</strong><br>
                <small>Tap the 3-dot menu (top right) → "Share" or "Download" to save to OneDrive</small>
              </div>
              <iframe src="${pdfDataUri}" style="flex:1;border:none;width:100%;"></iframe>
            </body>
          </html>
        `);
        newTab.document.close();
        setStatus("PDF opened in new tab");
      } else {
        // Popup blocked - fallback to direct download
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = pdfFileName;
        link.click();
        URL.revokeObjectURL(pdfUrl);
        setStatus("PDF downloaded");
        alert("PDF saved to Downloads. Open Files app to share to OneDrive.");
      }
      
    } catch (error) {
      alert("Error: " + (error?.message || "Failed to create PDF"));
      setStatus("Error creating PDF");
    } finally {
      setIsSharingToOneDrive(false);
    }
  };

  const navButton = (key, label, Icon) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium ${
        activeTab === key ? "bg-[#0B3A5B] text-white" : "bg-[#FDF6E9] text-[#4F6475]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  // Full-screen camera overlay
  if (showCamera) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted
          className="absolute inset-0 w-full h-full object-cover origin-center"
          style={{ transform: `scale(${zoomLevel})` }}
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Landscape mode - controls on right side */}
        {isLandscape ? (
          <>
            {/* Right side controls for landscape - compact layout */}
            <div 
              className="fixed top-0 right-0 bottom-0 w-24 z-[60] flex flex-col items-center justify-between py-4"
              style={{ 
                paddingRight: "max(0.5rem, env(safe-area-inset-right))",
                paddingTop: "max(0.5rem, env(safe-area-inset-top))",
                paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))"
              }}
            >
              {/* Top section: Zoom */}
              <div className="flex flex-col items-center gap-1 bg-black/40 rounded-full px-2 py-2">
                <span className="text-white text-xs font-medium">{zoomLevel.toFixed(1)}x</span>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.1"
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                  className="h-16 w-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}
                />
              </div>
              
              {/* Middle section: Capture button - large touch target */}
              <button
                type="button"
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  capturePhoto();
                }}
                onClick={capturePhoto}
                className="rounded-full bg-white/90 border-4 border-white/50 flex items-center justify-center active:scale-95 transition-transform shadow-lg"
                style={{ width: '72px', height: '72px', touchAction: 'manipulation' }}
              >
                <div className="rounded-full bg-white border-2 border-gray-300" style={{ width: '56px', height: '56px' }} />
              </button>
              
              {/* Bottom section: Photo count and Done */}
              <div className="flex flex-col items-center gap-2">
                <div className="text-white text-center bg-black/40 rounded-lg px-2 py-1">
                  <div className="text-lg font-bold">{photosTaken}</div>
                </div>
                <Button
                  type="button"
                  onClick={closeCamera}
                  className="bg-[#0B3A5B]/80 text-white px-3 py-1.5 rounded-xl font-semibold text-xs"
                >
                  Done
                </Button>
              </div>
            </div>
            
            {/* Top bar for landscape */}
            <div 
              className="fixed top-0 left-0 p-3 z-[60]"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <div className="flex items-center gap-2 text-white text-sm bg-black/40 rounded-full px-3 py-1">
                <MapPin className="w-4 h-4" />
                <span>{gps || "GPS..."}</span>
              </div>
            </div>
            
            {/* Cancel button - top left area */}
            <div 
              className="fixed top-0 left-0 p-3 z-[60]"
              style={{ paddingTop: "max(3rem, calc(env(safe-area-inset-top) + 2.5rem))" }}
            >
              <button onClick={closeCamera} className="text-white bg-black/40 rounded-full px-3 py-1 text-sm">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Portrait mode - controls at bottom */}
            <div 
              className="fixed bottom-0 left-0 right-0 p-3 z-[60]"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {/* Zoom slider */}
              <div className="flex items-center justify-center gap-2 mb-2 max-w-[200px] mx-auto bg-black/40 rounded-full px-3 py-1">
                <span className="text-white text-xs font-medium">{zoomLevel.toFixed(1)}x</span>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.1"
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
                />
              </div>
              
              <div className="flex items-center justify-between max-w-sm mx-auto">
                <div className="text-white text-center min-w-[50px] bg-black/40 rounded-lg px-2 py-1">
                  <div className="text-xl font-bold">{photosTaken}</div>
                </div>
                
                <button
                  onClick={capturePhoto}
                  className="w-18 h-18 rounded-full bg-white/90 border-4 border-white/50 flex items-center justify-center active:scale-95 transition-transform shadow-lg"
                  style={{ width: '72px', height: '72px' }}
                >
                  <div className="w-14 h-14 rounded-full bg-white border-2 border-gray-300" style={{ width: '56px', height: '56px' }} />
                </button>
                
                <Button
                  onClick={closeCamera}
                  className="bg-[#0B3A5B]/80 text-white px-3 py-2 rounded-xl font-semibold text-sm"
                >
                  Done
                </Button>
              </div>
            </div>
            
            {/* Fixed top bar - minimal */}
            <div 
              className="fixed top-0 left-0 right-0 p-3 z-[60] flex items-center justify-between"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <div className="flex items-center gap-2 text-white text-sm bg-black/40 rounded-full px-3 py-1">
                <MapPin className="w-4 h-4" />
                <span>{gps || "GPS..."}</span>
              </div>
              <button onClick={closeCamera} className="text-white bg-black/40 rounded-full px-3 py-1 text-sm">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDF6E9] p-3">
      <div className="mx-auto max-w-sm">
        {/* Header */}
        <div className="bg-[#0B3A5B] text-white text-center py-4 px-3 rounded-t-[28px] shadow-lg">
          <h1 className="text-lg font-bold tracking-wide">PASCO COUNTY CODE COMPLIANCE</h1>
        </div>
        <Card className="overflow-hidden rounded-t-none rounded-b-[28px] border-0 shadow-xl bg-white">
          <CardContent className="space-y-4 p-4">
            <div className="rounded-2xl bg-[#FAF8F2] p-3 text-sm text-[#4F6475]">{status}</div>

  <div className="grid grid-cols-4 gap-2">
    {navButton("field", "Field", Home)}
    {navButton("contact", "Contact", Phone)}
    {navButton("settings", "Settings", Settings)}
    {navButton("help", "Help", HelpCircle)}
  </div>

            {activeTab === "field" ? (
              <>
                {/* Hidden file input for batch import */}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={batchImportInputRef}
                  onChange={handleBatchImport}
                  className="hidden"
                />
                
                <Button
                  className="w-full h-12 text-base font-semibold bg-[#4A6FA5]"
                  onClick={() => batchImportInputRef.current?.click()}
                >
                  <FolderOpen className="mr-2 h-5 w-5" />Import from Gallery
                </Button>
                
                <div className="text-center text-xs text-[#6C7D8A] -mt-2">
                  Select multiple photos at once to import
                </div>

                <div className="space-y-3">
                  {photos.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-[#FAF8F2] p-8 text-center text-sm text-[#6C7D8A]">
                      No photos yet.
                    </div>
                  ) : (
                    photos.map((photo, index) => (
                      <div key={photo.id} className="overflow-hidden rounded-2xl border bg-white">
                        <img src={photo.stamped || photo.original} alt={`Photo ${index + 1}`} className="h-48 w-full object-cover" />
                        <div className="space-y-2 p-3">
                          <div className="text-sm font-semibold">Photo {index + 1}</div>
                          <div className="text-xs text-[#6C7D8A]">{new Date(photo.createdAt).toLocaleString()}</div>
                          <Button variant="destructive" className="rounded-xl w-full" onClick={() => removePhoto(photo.id)}>
                            <Trash2 className="mr-1 h-4 w-4" />Remove
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Save Photo Pack Button - Primary action */}
                <Button 
                  className={`w-full h-16 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 shadow-lg ${photos.length > 0 && !isSharingToOneDrive ? 'save-button-pulse' : ''}`}
                  onClick={savePhotoPackByDateTime}
                  disabled={isSharingToOneDrive || photos.length === 0}
                >
                  <Save className="mr-2 h-6 w-6" />
                  {isSharingToOneDrive ? "Creating PDF..." : `Save Photo Pack (${photos.length})`}
                </Button>
                {photos.length > 0 && (
                  <div className="text-center text-xs text-emerald-700 -mt-2">
                    Photos will be sorted by date & time in PDF
                  </div>
                )}

                <Button className="h-12 w-full" variant="outline" onClick={() => { setPhotos([]); setCaseNumber(""); safeStorage.removeItem(DRAFT_KEY); photoDatabase.clearPhotos(); console.log('[v0] Clear button pressed - photos cleared'); setStatus("Case cleared."); }}>
                  <Trash2 className="mr-2 h-4 w-4" />Clear All
                </Button>

                </>
            ) : null}

            {activeTab === "settings" ? (
              <div className="space-y-3">
                <div className="rounded-2xl border bg-white p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Settings className="h-4 w-4" />Tenant Settings
                  </div>
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <Label>Agency / Tenant Label</Label>
                      <Input
                        value={settings.tenantLabel}
                        onChange={(e) => setSettings((prev) => ({ ...prev, tenantLabel: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Default Officer Name</Label>
                      <Input
                        value={settings.officerDefault}
                        onChange={(e) => setSettings((prev) => ({ ...prev, officerDefault: e.target.value }))}
                      />
                    </div>
                    <Button className="w-full" onClick={saveSettings}>
                      <Save className="mr-2 h-4 w-4" />Save Settings
                    </Button>
                  </div>
                </div>

                {settingsSaved ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    Settings saved on this device.
                  </div>
                ) : null}

                <div className="rounded-2xl border bg-white p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Mail className="h-4 w-4" />Support
                  </div>
                  <div className="mt-2 text-xs text-[#4F6475]">
                    Need help or have questions? Contact support.
                  </div>
                  <Button
                    className="mt-3 w-full"
                    variant="outline"
                    onClick={() => window.location.href = "mailto:dhramika@pascocounty.net?subject=Code%20Compliance%20Photo%20App%20Support"}
                  >
                    <Mail className="mr-2 h-4 w-4" />Email Support
                  </Button>
                </div>
              </div>
            ) : null}

            {activeTab === "contact" ? (
              <div className="space-y-3">
                <div className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <h3 className="text-sm font-semibold text-[#0B3A5B] flex items-center gap-2">
                      <Phone className="h-4 w-4" />Contact Directory
                    </h3>
                    <button
                      onClick={exportContactsToPDF}
                      className="flex items-center gap-1.5 bg-[#0B3A5B] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#0B3A5B]/90 transition-colors flex-shrink-0"
                      title="Export contacts to PDF"
                    >
                      <Download className="h-3.5 w-3.5" />Export PDF
                    </button>
                  </div>
                  <p className="text-xs text-[#6C7D8A] mb-4">
                    Tap phone numbers to call or email addresses to send an email.
                  </p>
                  
                  <div className="space-y-3">
                    {/* All Contacts - Editable */}
                    {contacts.map((contact) => (
                      <div 
                        key={contact.id} 
                        className={`p-3 rounded-xl ${
                          contact.highlighted 
                            ? "bg-[#FAF8F2] border-2 border-[#0B3A5B]" 
                            : contact.isDefault 
                              ? "bg-[#FAF8F2]" 
                              : "bg-[#E8F4EA]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-[#0B3A5B]">{contact.title}</h4>
                            {contact.organization && (
                              <p className="text-xs text-[#6C7D8A]">{contact.organization}</p>
                            )}
                            {contact.contactPerson && (
                              <p className="text-xs text-[#4F6475] mt-1">{contact.contactPerson}</p>
                            )}
                            {contact.notes && (
                              <p className="text-xs text-[#6C7D8A] italic mt-1">{contact.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {contact.phone && (
                              <a 
                                href={`tel:${contact.phone.replace(/[^0-9,]/g, "")}`} 
                                className="flex items-center gap-1 bg-[#0B3A5B] text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                              >
                                <Phone className="h-3 w-3" />Call
                              </a>
                            )}
                            <button
                              onClick={() => startEditContact(contact)}
                              className="p-1.5 text-[#0B3A5B] hover:bg-[#0B3A5B]/10 rounded-lg"
                              title="Edit contact"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => deleteContact(contact.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                              title="Delete contact"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {contact.phone && (
                          <p className={`text-xs text-[#4F6475] mt-2 ${contact.highlighted ? "font-semibold" : ""}`}>
                            {contact.phone}
                          </p>
                        )}
                        {contact.email && (
                          <a 
                            href={`mailto:${contact.email}`} 
                            className="flex items-center gap-1 text-xs text-[#0B3A5B] mt-1 underline"
                          >
                            <Mail className="h-3 w-3" />{contact.email}
                          </a>
                        )}
                      </div>
                    ))}

                    {/* Add New Contact Button */}
                    <button
                      onClick={() => setShowAddContactModal(true)}
                      className="w-full p-3 border-2 border-dashed border-[#0B3A5B] rounded-xl flex items-center justify-center gap-2 text-[#0B3A5B] hover:bg-[#0B3A5B]/5 transition-colors"
                    >
                      <UserPlus className="h-4 w-4" />
                      <span className="text-sm font-medium">Add New Contact</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "help" ? (
              <div className="space-y-4">
                {/* QR Code Section */}
                <div className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <QrCode className="h-4 w-4" />Scan to Open App
                  </div>
                  <div className="flex justify-center bg-white p-4 rounded-xl border">
                    <QRCodeSVG 
                      value={typeof window !== 'undefined' ? window.location.href : 'https://example.com'} 
                      size={180}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                  <p className="mt-3 text-xs text-center text-[#6C7D8A]">
                    Scan this QR code with any phone camera to open the app
                  </p>
                </div>

                {/* Bookmark Instructions */}
                <div className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Bookmark className="h-4 w-4" />Save as Bookmark in Chrome
                  </div>
                  <ol className="space-y-3 text-sm text-[#4F6475]">
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B3A5B] text-white text-xs flex items-center justify-center">1</span>
                      <span>Open this app in Google Chrome browser</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B3A5B] text-white text-xs flex items-center justify-center">2</span>
                      <span>Tap the <strong>three dots menu</strong> (top right corner)</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B3A5B] text-white text-xs flex items-center justify-center">3</span>
                      <span>Tap the <strong>star icon</strong> or select <strong>"Add to bookmarks"</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B3A5B] text-white text-xs flex items-center justify-center">4</span>
                      <span>Choose <strong>"Mobile bookmarks"</strong> as the folder</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B3A5B] text-white text-xs flex items-center justify-center">5</span>
                      <span>Tap <strong>"Save"</strong> to confirm</span>
                    </li>
                  </ol>
                  <div className="mt-4 p-3 bg-[#FAF8F2] rounded-xl text-xs text-[#4F6475]">
                    <strong>Tip:</strong> To add to home screen, tap menu and select "Add to Home screen" for quick access like an app!
                  </div>
                </div>

                {/* Samsung Phone Instructions */}
                <div className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Smartphone className="h-4 w-4" />Using on Samsung Phone
                  </div>
                  <div className="space-y-4 text-sm text-[#4F6475]">
                    <div>
                      <h4 className="font-semibold text-[#0B3A5B] mb-2">Taking Photos</h4>
                      <ol className="space-y-2 pl-4">
                        <li>1. Enter Case Number and Officer name</li>
<li>2. Tap <strong>"Camera"</strong> button</li>
  <li>3. Your phone's camera app will open</li>
  <li>4. Take photo and confirm</li>
  <li>5. Repeat to take more photos</li>
                        <li>6. Tap <strong>"Close Camera"</strong> when done</li>
                      </ol>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-[#0B3A5B] mb-2">Exporting Photos</h4>
                      <ol className="space-y-2 pl-4">
                        <li>1. Review your stamped photos in the gallery</li>
                        <li>2. Tap <strong>"OneDrive"</strong> to export PDF</li>
                        <li>3. Choose save location or share option</li>
                        <li>4. PDF includes all photos with timestamps</li>
                      </ol>
                    </div>

                    <div>
                      <h4 className="font-semibold text-[#0B3A5B] mb-2">GPS Location</h4>
                      <p>GPS updates automatically every 30 seconds. Make sure location services are enabled in your phone settings for accurate coordinates.</p>
                    </div>

                    <div className="p-3 bg-[#FAF8F2] rounded-xl">
                      <strong>Samsung Tips:</strong>
                      <ul className="mt-2 space-y-1">
                        <li>• Use Chrome or Samsung Internet browser</li>
                        <li>• Enable location in Settings {'>'} Location</li>
                        <li>• Allow camera permissions when asked</li>
                        <li>• Keep screen on while taking photos</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

{/* Full-screen Photo Viewer Modal */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 bg-black z-50"
          onClick={() => setViewingPhoto(null)}
        >
          <button
            onClick={() => setViewingPhoto(null)}
            className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white z-10"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={viewingPhoto.stamped || viewingPhoto.original}
            alt="Full size photo"
            className="absolute inset-0 w-full h-full object-cover"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Add/Edit Contact Modal */}
      {showAddContactModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeContactModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-[#0B3A5B] flex items-center gap-2">
                {editingContact ? (
                  <><Pencil className="h-5 w-5" />Edit Contact</>
                ) : (
                  <><UserPlus className="h-5 w-5" />Add New Contact</>
                )}
              </h3>
              <button
                onClick={closeContactModal}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0B3A5B] mb-1">
                  Title / Department *
                </label>
                <Input
                  placeholder="e.g., Building Permits"
                  value={newContact.title}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0B3A5B] mb-1">
                  Organization
                </label>
                <Input
                  placeholder="e.g., County Planning Office"
                  value={newContact.organization}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, organization: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0B3A5B] mb-1">
                  Contact Person
                </label>
                <Input
                  placeholder="e.g., John Smith"
                  value={newContact.contactPerson}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, contactPerson: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0B3A5B] mb-1">
                  Notes
                </label>
                <Input
                  placeholder="e.g., Questions about permits"
                  value={newContact.notes}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0B3A5B] mb-1">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  placeholder="e.g., 727-555-1234"
                  value={newContact.phone}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0B3A5B] mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="e.g., contact@example.com"
                  value={newContact.email}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="p-4 border-t flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={closeContactModal}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={editingContact ? saveEditedContact : addContact}
              >
                {editingContact ? (
                  <><Save className="h-4 w-4" />Save Changes</>
                ) : (
                  <><Plus className="h-4 w-4" />Add Contact</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
