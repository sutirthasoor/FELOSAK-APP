import { Platform, Alert, Dimensions, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme, ActivityIndicator } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { loadCurrency } from '@/utils/format';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { 
  INCOME_INVESTMENT_CATEGORIES, 
  EXPENSE_INVESTMENT_CATEGORIES,
  INCOME_DEBT_CATEGORIES,
  EXPENSE_DEBT_CATEGORIES,
  EXPENSE_CATEGORIES  // ✅ ADD THIS
} from "@/app/add-transaction";
import { Document as DocumentType } from '@/context/AppContext'; // Import your Document type
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc, getDoc, setDoc, addDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Image } from "react-native";
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import favicon from '@/assets/images/favicon.png';
import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApp, CashBook, Transaction } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import Colors from "@/constants/colors";
import { formatEGP, getCurrencyCode, subscribeToCurrencyChanges, formatDate } from "@/utils/format";
import { getPaymentModeLabel } from "@/app/add-transaction";
const screenWidth = Dimensions.get("window").width;

type DashFilter = "all" | "income" | "expense";
type BookType = "personal" | "business";

interface ProfileData {
  name: string;
  phoneNumber: string;
  address: string;
  taxId: string;
  bankAccount: string;
  paymentLink: string;
  photo: string;
}
interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  currency?: string;
  paymentTerms?: string;
  taxId?: string;
  internalNotes?: string;
  status: "active" | "inactive";
  createdAt: number;
  updatedAt: number;
  userId: string;
}
const STORAGE_KEY = "user_profile_data";
const ORGANIZATION_KEY = "user_organization_data";

// ==================== PROFILE MODAL ====================
function ProfileModal({ visible, onClose, theme, isDark, onLogout, onDeleteAccount, onProfileUpdate }: { 
  visible: boolean; 
  onClose: () => void; 
  theme: typeof Colors.dark; 
  isDark: boolean; 
  onLogout: () => void;
  onDeleteAccount?: () => void;
  onProfileUpdate?: () => void;
}) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    phoneNumber: "",
    address: "",
    taxId: "",
    bankAccount: "",
    paymentLink: "",
    photo: "",
  });
  const [orgData, setOrgData] = useState({ organizationName: "", industry: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const pickProfilePhoto = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/jpg,image/webp';
        input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (file) {
            if (file.size > 2 * 1024 * 1024) {
              Alert.alert("Error", "Image size should be less than 2MB");
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64String = reader.result as string;
              setProfile({ ...profile, photo: base64String });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
        return;
      }
      
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "We need access to your photos to set a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
        aspect: [1, 1],
      });
      
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          setProfile({ ...profile, photo: `data:image/jpeg;base64,${asset.base64}` });
        } else if (asset.uri) {
          setProfile({ ...profile, photo: asset.uri });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const takeProfilePhoto = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/jpg';
        input.capture = 'environment';
        input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (file) {
            if (file.size > 2 * 1024 * 1024) {
              Alert.alert("Error", "Image size should be less than 2MB");
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64String = reader.result as string;
              setProfile({ ...profile, photo: base64String });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
        return;
      }
      
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera access is needed to take photos.");
        return;
      }
      
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.5,
        base64: true,
        aspect: [1, 1],
      });
      
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          setProfile({ ...profile, photo: `data:image/jpeg;base64,${asset.base64}` });
        } else if (asset.uri) {
          setProfile({ ...profile, photo: asset.uri });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to take photo");
    }
  };

  const loadProfile = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const userId = user.id;
      
      const [savedData, savedOrg] = await Promise.all([
        AsyncStorage.getItem(`${STORAGE_KEY}_${userId}`),
        AsyncStorage.getItem(`${ORGANIZATION_KEY}_${userId}`)
      ]);
      
      if (savedData) {
        const parsed = JSON.parse(savedData);
        setProfile({
          name: parsed.name || "",
          phoneNumber: parsed.phoneNumber || "",
          address: parsed.address || "",
          taxId: parsed.taxId || "",
          bankAccount: parsed.bankAccount || "",
          paymentLink: parsed.paymentLink || "",
          photo: parsed.photo || "",
        });
      }
      
      if (savedOrg) {
        const parsedOrg = JSON.parse(savedOrg);
        setOrgData({
          organizationName: parsedOrg.organizationName || "",
          industry: parsedOrg.industry || ""
        });
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && user) {
      loadProfile();
    }
  }, [visible, user]);

  const saveProfile = async () => {
    if (!user) return;
    try {
      const userId = user.id;
      await AsyncStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(profile));
      await AsyncStorage.setItem(`${ORGANIZATION_KEY}_${userId}`, JSON.stringify(orgData));
      
      if (onProfileUpdate) onProfileUpdate();
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditing(false);
      onClose();
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "Failed to save profile");
    }
  };

  const handleLogoutPress = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: onLogout }
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: onDeleteAccount }
      ]
    );
  };

  if (loading) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <View style={[styles.profileModalContent, { backgroundColor: isDark ? '#1f2937' : '#FFFFFF' }]}>
            <ActivityIndicator size="large" color={theme.tint} />
          </View>
        </View>
      </Modal>
    );
  }

    return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.profileModalContent, { width: "95%", maxWidth: 500, backgroundColor: isDark ? '#1f2937' : '#FFFFFF' }]}>
          <View style={styles.profileModalHeader}>
            <Text style={[styles.profileModalTitle, { color: theme.text, fontFamily: "Inter_700Bold" }]}>
              {isEditing ? "Edit Profile" : "Profile"}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.profileUserSection}>
              <Pressable onPress={isEditing ? () => {
                Alert.alert(
                  "Profile Photo",
                  "Choose an option",
                  [
                    { text: "Take Photo", onPress: takeProfilePhoto },
                    { text: "Choose from Gallery", onPress: pickProfilePhoto },
                    { text: "Cancel", style: "cancel" }
                  ]
                );
              } : undefined}>
                {profile.photo ? (
                  <Image source={{ uri: profile.photo }} style={styles.profileAvatarImage} />
                ) : (
                  <View style={[styles.profileAvatar, { backgroundColor: theme.tint + '20' }]}>
                    <Feather name="user" size={32} color={theme.tint} />
                  </View>
                )}
                {isEditing && (
                  <View style={styles.editPhotoBadge}>
                    <Feather name="camera" size={14} color="#FFF" />
                  </View>
                )}
              </Pressable>
              <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>{user?.email}</Text>
            </View>

            {!isEditing ? (
              <>
                <View style={styles.profileInfoRow}>
                  <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Full Name</Text>
                  <Text style={[styles.profileInfoValue, { color: theme.text }]}>{profile.name || "Not set"}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Phone Number</Text>
                  <Text style={[styles.profileInfoValue, { color: theme.text }]}>{profile.phoneNumber || "Not set"}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Address</Text>
                  <Text style={[styles.profileInfoValue, { color: theme.text }]}>{profile.address || "Not set"}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Organization</Text>
                  <Text style={[styles.profileInfoValue, { color: theme.text }]}>{orgData.organizationName || "Not set"}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Industry</Text>
                  <Text style={[styles.profileInfoValue, { color: theme.text }]}>{orgData.industry || "Not set"}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>GSTIN Number</Text>
                  <Text style={[styles.profileInfoValue, { color: theme.text }]}>{profile.taxId || "Not set"}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Bank Account</Text>
                  <Text style={[styles.profileInfoValue, { color: theme.text }]}>{profile.bankAccount || "Not set"}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Payment Link</Text>
                  <Text style={[styles.profileInfoValue, { color: theme.text }]}>{profile.paymentLink || "Not set"}</Text>
                </View>
                
                <Pressable onPress={() => setIsEditing(true)} style={[styles.profileEditBtn, { backgroundColor: theme.tint }]}>
                  <Feather name="edit-2" size={18} color="#FFF" />
                  <Text style={[styles.profileEditBtnText, { color: "#FFF" }]}>Edit Profile</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.profileField}>
                  <Text style={[styles.profileLabel, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>Full Name</Text>
                  <TextInput style={[styles.profileInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: theme.text, borderColor: theme.border }]} placeholder="Enter your name" placeholderTextColor={theme.textSecondary} value={profile.name} onChangeText={(text) => setProfile({ ...profile, name: text })} />
                </View>
                <View style={styles.profileField}>
                  <Text style={[styles.profileLabel, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>Phone Number</Text>
                  <TextInput style={[styles.profileInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: theme.text, borderColor: theme.border }]} placeholder="+1 234 567 8900" placeholderTextColor={theme.textSecondary} value={profile.phoneNumber} onChangeText={(text) => setProfile({ ...profile, phoneNumber: text })} keyboardType="phone-pad" />
                </View>
                <View style={styles.profileField}>
                  <Text style={[styles.profileLabel, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>Address</Text>
                  <TextInput style={[styles.profileInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: theme.text, borderColor: theme.border }]} placeholder="Your address" placeholderTextColor={theme.textSecondary} value={profile.address} onChangeText={(text) => setProfile({ ...profile, address: text })} multiline numberOfLines={2} />
                </View>
                <View style={styles.profileField}>
                  <Text style={[styles.profileLabel, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>GSTIN Number</Text>
                  <TextInput style={[styles.profileInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: theme.text, borderColor: theme.border }]} placeholder="GSTIN number" placeholderTextColor={theme.textSecondary} value={profile.taxId} onChangeText={(text) => setProfile({ ...profile, taxId: text })} />
                </View>
                <View style={styles.profileField}>
                  <Text style={[styles.profileLabel, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>Bank Account</Text>
                  <TextInput style={[styles.profileInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: theme.text, borderColor: theme.border }]} placeholder="Bank Name - Account Number" placeholderTextColor={theme.textSecondary} value={profile.bankAccount} onChangeText={(text) => setProfile({ ...profile, bankAccount: text })} />
                </View>
                <View style={styles.profileField}>
                  <Text style={[styles.profileLabel, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>Payment Link</Text>
                  <TextInput style={[styles.profileInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: theme.text, borderColor: theme.border }]} placeholder="https://..." placeholderTextColor={theme.textSecondary} value={profile.paymentLink} onChangeText={(text) => setProfile({ ...profile, paymentLink: text })} />
                </View>
                <View style={styles.profileModalActions}>
                  <Pressable onPress={() => setIsEditing(false)} style={[styles.profileCancelBtn, { backgroundColor: theme.surface }]}><Text style={[styles.profileBtnText, { color: theme.text }]}>Cancel</Text></Pressable>
                  <Pressable onPress={saveProfile} style={[styles.profileSaveBtn, { backgroundColor: theme.tint }]}><Text style={[styles.profileBtnText, { color: "#FFF" }]}>Save</Text></Pressable>
                </View>
              </>
            )}

            <View style={[styles.profileDivider, { backgroundColor: theme.border }]} />
            
            <Pressable onPress={handleDeleteAccount} style={[styles.profileDeleteBtn, { backgroundColor: theme.expense + '15', borderColor: theme.expense, marginBottom: 12 }]}>
              <Feather name="trash-2" size={20} color={theme.expense} />
              <Text style={[styles.profileDeleteText, { color: theme.expense, fontFamily: "Inter_600SemiBold" }]}>Delete Account</Text>
            </Pressable>
            
            <Pressable onPress={handleLogoutPress} style={[styles.profileLogoutBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Feather name="log-out" size={20} color={theme.textSecondary} />
              <Text style={[styles.profileLogoutText, { color: theme.textSecondary, fontFamily: "Inter_600SemiBold" }]}>Sign Out</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ==================== TX ITEM COMPONENT ====================
function TxItem({ tx, theme, onEdit, onDelete, canEdit }: { 
  tx: Transaction; 
  theme: typeof Colors.dark; 
  onEdit: (tx: Transaction) => void; 
  onDelete: (tx: Transaction) => void;
  canEdit: boolean;
}) {
  if (!tx || !tx.id) return null;
  const isIncome = tx.type === "income";
  const modeLabel = tx.paymentMode && tx.paymentMode !== "cash" ? getPaymentModeLabel(tx.paymentMode) : null;
  
  return (
    <Pressable 
      onPress={() => canEdit && onEdit(tx)} 
      onLongPress={() => canEdit && onDelete(tx)} 
      disabled={!canEdit}
      style={({ pressed }) => [styles.txItem, { backgroundColor: pressed && canEdit ? theme.surface : "transparent", opacity: !canEdit ? 0.7 : 1 }]}
    >
      <View style={[styles.txIcon, { backgroundColor: isIncome ? theme.income + '15' : theme.expense + '15' }]}>
        <Feather name={isIncome ? "trending-up" : "trending-down"} size={20} color={isIncome ? theme.income : theme.expense} />
      </View>
      <View style={styles.txContent}>
        <View style={styles.txCatRow}>
          <Text style={[styles.txCat, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>{tx.category}</Text>
          {modeLabel && <Text style={[styles.txPayMode, { color: theme.textSecondary }]}>• {modeLabel}</Text>}
        </View>
        {tx.note ? <Text style={[styles.txNote, { color: theme.textSecondary }]} numberOfLines={1}>{tx.note}</Text> : null}
        <View style={styles.txMeta}>
          <Text style={[styles.txDate, { color: theme.textSecondary }]}>{formatDate(tx.createdAt)}</Text>
        </View>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmt, { color: isIncome ? theme.income : theme.expense, fontFamily: "Inter_600SemiBold" }]}>
          {isIncome ? "+" : "-"} {formatEGP(tx.amount)}
        </Text>
      </View>
    </Pressable>
  );
}
// ==================== BOTTOM TAB BAR COMPONENT ====================
const BottomTabBar = React.memo(({ selectedView, currentPage, onPageChange }: { 
  selectedView: "personal" | "business";
  currentPage: string;
  onPageChange: (page: string) => void;
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  
  console.log("🔵🔵🔵 BottomTabBar RENDERING with selectedView:", selectedView);
  
  // Navigation items based on selected view
  const navItems = selectedView === "personal" 
    ? [
        { id: "home", label: "Home", icon: "home" },
        { id: "accounts", label: "Accounts", icon: "briefcase" },
        { id: "transactions", label: "Txns", icon: "repeat" },
        { id: "budgets", label: "Budgets", icon: "pie-chart" },
        { id: "goals", label: "Goals", icon: "target" },
        { id: "settings", label: "Settings", icon: "settings" },
      ]
    : [
        { id: "home", label: "Home", icon: "home" },
        { id: "docs", label: "Docs", icon: "file-text" },
        { id: "clients", label: "Clients", icon: "users" },
        { id: "books", label: "Books", icon: "book-open" },
        { id: "reports", label: "Reports", icon: "bar-chart-2" },
        { id: "settings", label: "Settings", icon: "settings" },
      ];

  console.log("📋 Nav items labels:", navItems.map(i => i.label));

  return (
    <View style={[styles.bottomTabBar, { paddingBottom: insets.bottom || 12, backgroundColor: '#FFFFFF', borderTopColor: '#E5E7EB' }]}>
      {navItems.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onPageChange(item.id)}
          style={({ pressed }) => [
            styles.bottomTabItem,
            currentPage === item.id && styles.bottomTabItemActive,
            pressed && { opacity: 0.7 }
          ]}
        >
          <Feather 
            name={item.icon as any} 
            size={22} 
            color={currentPage === item.id ? '#3B82F6' : '#9CA3AF'} 
          />
          <Text style={[
            styles.bottomTabLabel,
            currentPage === item.id && styles.bottomTabLabelActive,
            { color: currentPage === item.id ? '#3B82F6' : '#9CA3AF' }
          ]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if selectedView or currentPage changed
  const shouldUpdate = prevProps.selectedView !== nextProps.selectedView || 
                       prevProps.currentPage !== nextProps.currentPage;
  if (shouldUpdate) {
    console.log("🔄 BottomTabBar will UPDATE:", {
      from: prevProps.selectedView,
      to: nextProps.selectedView
    });
  }
  return !shouldUpdate;
});

// ==================== MAIN BOOKS LIST VIEW ====================
// ==================== MAIN BOOKS LIST VIEW ====================
function BooksListView({ 
  selectedTab: externalSelectedTab, 
  onTabChange
}: { 
  selectedTab: "personal" | "business";
  onTabChange: (tab: "personal" | "business") => void;
}) {
  // Keep the internal currentPage state
  const [currentPage, setCurrentPage] = useState("home");
// Add these state variables after the other useState declarations
// Add ALL these with your other useState declarations
const [documentsList, setDocumentsList] = useState<Document[]>([]);
const [documentsFilter, setDocumentsFilter] = useState<FilterType>("All");
const [showCreateDocumentModal, setShowCreateDocumentModal] = useState(false);
const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
const [showDocumentDetailModal, setShowDocumentDetailModal] = useState(false);
// Add these with your other useState declarations in BooksListView
const [clients, setClients] = useState<Client[]>([]);
const [clientFilterStatus, setClientFilterStatus] = useState<"all" | "active" | "inactive">("all");
const [showCreateClientModal, setShowCreateClientModal] = useState(false);
const [showClientDetailModal, setShowClientDetailModal] = useState(false);
const [selectedClient, setSelectedClient] = useState<Client | null>(null);
const [isEditingClient, setIsEditingClient] = useState(false);
const [selectedReport, setSelectedReport] = useState<string>("netWorth");
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewReport, setPreviewReport] = useState<any>(null);
// Form states for create/edit client
const [clientFormName, setClientFormName] = useState("");
const [clientFormCompany, setClientFormCompany] = useState("");
const [clientFormEmail, setClientFormEmail] = useState("");
const [clientFormPhone, setClientFormPhone] = useState("");
const [clientFormCurrency, setClientFormCurrency] = useState(getCurrencyCode());
const [clientFormPaymentTerms, setClientFormPaymentTerms] = useState("Net 30");
const [clientFormTaxId, setClientFormTaxId] = useState("");
const [clientFormInternalNotes, setClientFormInternalNotes] = useState("");
const [clientFormStatus, setClientFormStatus] = useState<"active" | "inactive">("active");
const [isSubmittingClient, setIsSubmittingClient] = useState(false);
// ADD THESE for the create document form
const [createDocType, setCreateDocType] = useState<string>("Invoice");
const [createDocPartyName, setCreateDocPartyName] = useState("");
const [createDocAmount, setCreateDocAmount] = useState("");
const [createDocDueDate, setCreateDocDueDate] = useState("");
const [createDocNotes, setCreateDocNotes] = useState("");
const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const theme = Colors.light;
  const { books, setActiveBook, deleteBook, updateBook, refreshBooks, transactions, addTransaction, activeBook } = useApp();
  const { user, logout, currentBookAccess, isBookRestricted } = useAuth();
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<CashBook | null>(null);
  const [showCannotDeleteModal, setShowCannotDeleteModal] = useState(false);
  const [showCreateBookModal, setShowCreateBookModal] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [selectedView, setSelectedView] = useState<BookType>(externalSelectedTab);
  const [newBookName, setNewBookName] = useState("");
  const [newBookDescription, setNewBookDescription] = useState("");
  const [newBookType, setNewBookType] = useState<"personal" | "business">("personal");
  const [newBookCategory, setNewBookCategory] = useState<string>("assets");
  const [isCreating, setIsCreating] = useState(false);
// Add this with your other useState declarations
// Add these with your other useState declarations at the top of BooksListView
const [showFilterModal, setShowFilterModal] = useState(false);
const [localFilterType, setLocalFilterType] = useState<"all" | "income" | "expense">("all");
const [localSortOrder, setLocalSortOrder] = useState<"newest" | "oldest">("newest");
const [localNewBookName, setLocalNewBookName] = useState("");
  const [localNewBookDescription, setLocalNewBookDescription] = useState("");
  const [localShowBookModal, setLocalShowBookModal] = useState(false);
  const [personalTransactions, setPersonalTransactions] = useState<Transaction[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [allTransactionsForBusiness, setAllTransactionsForBusiness] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
// Add this with your other useState declarations
const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
// Add this with your other useState declarations
const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  // ==================== BUDGET STATE ====================
const [budgets, setBudgets] = useState<{ 
  id: string; 
  category: string; 
  icon: string; 
  color: string; 
  spent: number; 
  budget: number 
}[]>([]);
const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);
const [selectedBudgetCategory, setSelectedBudgetCategory] = useState("");
const [budgetAmount, setBudgetAmount] = useState("");
const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

// ==================== GOAL STATE ====================
const [goals, setGoals] = useState<{ 
  id: string; 
  name: string; 
  icon: string; 
  color: string; 
  targetAmount: number; 
  savedAmount: number;
  deadline?: string;
  status: "active" | "completed";
}[]>([]);
const [showAddGoalModal, setShowAddGoalModal] = useState(false);
const [selectedGoalTab, setSelectedGoalTab] = useState<"active" | "completed">("active");
const [newGoalName, setNewGoalName] = useState("");
const [newGoalTarget, setNewGoalTarget] = useState("");
const [newGoalIcon, setNewGoalIcon] = useState("target");
const [newGoalDeadline, setNewGoalDeadline] = useState("");
const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  // Calculate current month vs last month statistics
  const calculateStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    let currentIncome = 0;
    let currentExpense = 0;
    let lastIncome = 0;
    let lastExpense = 0;
    
    personalTransactions.forEach(tx => {
      const txDate = new Date(tx.createdAt);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      const amount = tx.amount;
      
      if (txYear === currentYear && txMonth === currentMonth) {
        if (tx.type === 'income') currentIncome += amount;
        else currentExpense += amount;
      } else if (txYear === lastMonthYear && txMonth === lastMonth) {
        if (tx.type === 'income') lastIncome += amount;
        else lastExpense += amount;
      }
    });
    
    const incomeChange = lastIncome === 0 ? 100 : ((currentIncome - lastIncome) / lastIncome) * 100;
    const expenseChange = lastExpense === 0 ? 100 : ((currentExpense - lastExpense) / lastExpense) * 100;
    
    return {
      totalIncome: currentIncome,
      totalExpense: currentExpense,
      incomeChange,
      expenseChange,
      isIncomeUp: incomeChange >= 0,
      isExpenseUp: expenseChange >= 0,
    };
  }, [personalTransactions]);
  // Budget categories with icons and colors
const BUDGET_CATEGORIES = [
  { name: "Food & Dining", icon: "shopping-bag", color: "#3B82F6", keywords: ["food", "dining", "restaurant", "grocery", "meal"] },
  { name: "Transportation", icon: "truck", color: "#10B981", keywords: ["transport", "fuel", "gas", "taxi", "uber", "bus"] },
  { name: "Entertainment", icon: "film", color: "#8B5CF6", keywords: ["movie", "netflix", "spotify", "game", "cinema"] },
  { name: "Shopping", icon: "shopping-cart", color: "#F59E0B", keywords: ["shopping", "amazon", "cloth", "store", "retail"] },
  { name: "Bills & Utilities", icon: "home", color: "#EC4899", keywords: ["bill", "utility", "electricity", "water", "rent"] },
  { name: "Health & Fitness", icon: "heart", color: "#EF4444", keywords: ["health", "gym", "doctor", "medical", "pharmacy"] },
  { name: "Education", icon: "book", color: "#6366F1", keywords: ["education", "course", "book", "training", "school"] },
  { name: "Travel", icon: "map", color: "#14B8A6", keywords: ["travel", "hotel", "flight", "vacation", "trip"] },
];
// Add this useEffect after your other useEffects in BooksListView
useEffect(() => {
  const updateGoalSavedAmounts = () => {
    if (!user || goals.length === 0) return;
    
    console.log("📊 Calculating goal saved amounts from transactions...");
    
    // Create a map of goalId -> savedAmount
    const goalSavings: { [goalId: string]: number } = {};
    
    // Initialize all goals with 0
    goals.forEach(goal => {
      goalSavings[goal.id] = 0;
    });
    
    // Process each transaction
    personalTransactions.forEach(transaction => {
      // Check if this transaction has a goalId
      const goalId = (transaction as any).goalId;
      
      if (goalId && goalSavings.hasOwnProperty(goalId)) {
        // ✅ This transaction is directly linked to a goal
        if (transaction.type === 'income') {
          goalSavings[goalId] += transaction.amount;
          console.log(`  ✅ Income ${transaction.amount} added to goal ${goalId}`);
        } else if (transaction.type === 'expense') {
          goalSavings[goalId] -= transaction.amount;
          console.log(`  ✅ Expense ${transaction.amount} subtracted from goal ${goalId}`);
        }
      } else {
        // Fallback: Check by category name (for backward compatibility)
        const category = transaction.category?.toLowerCase() || "";
        const note = transaction.note?.toLowerCase() || "";
        
        goals.forEach(goal => {
          const goalName = goal.name.toLowerCase();
          const savingsKeywords = ['savings', 'goal', 'fund', 'deposit', 'save', 'emergency', 'contribution'];
          
          const isForThisGoal = 
            category === 'goal' ||
            category.includes(goalName) || 
            note.includes(goalName) ||
            savingsKeywords.some(keyword => category.includes(keyword));
          
          // Only match if this transaction is NOT already matched to another goal
          if (isForThisGoal && !(transaction as any).goalId) {
            if (transaction.type === 'income') {
              goalSavings[goal.id] += transaction.amount;
              console.log(`  ⚠️ Income ${transaction.amount} added to goal ${goal.name} by category match`);
            } else if (transaction.type === 'expense') {
              goalSavings[goal.id] -= transaction.amount;
              console.log(`  ⚠️ Expense ${transaction.amount} subtracted from goal ${goal.name} by category match`);
            }
          }
        });
      }
    });
    
    // Update goals with new saved amounts
    const updatedGoals = goals.map(goal => ({
      ...goal,
      savedAmount: goalSavings[goal.id] || 0
    }));
    
    // Check if any goal's savedAmount changed
    const hasChanged = updatedGoals.some((goal, index) => 
      goal.savedAmount !== goals[index].savedAmount
    );
    
    if (hasChanged) {
      console.log("📊 Updating goal saved amounts:", updatedGoals.map(g => ({ 
        name: g.name, 
        saved: g.savedAmount 
      })));
      setGoals(updatedGoals);
      if (user) {
        AsyncStorage.setItem(`goals_${user.id}`, JSON.stringify(updatedGoals));
      }
    } else {
      console.log("📊 No changes to goal saved amounts");
    }
  };
  
  // Only run if not currently updating
  if (!goalsUpdateRef.current) {
    goalsUpdateRef.current = true;
    updateGoalSavedAmounts();
    setTimeout(() => {
      goalsUpdateRef.current = false;
    }, 500);
  }
}, [personalTransactions, user]); // ✅ Remove 'goals' from dependencies // ✅ Only depend on personalTransactions and user, NOT goals
// Load budgets from AsyncStorage
useEffect(() => {
  const loadBudgets = async () => {
    if (!user) return;
    try {
      const savedBudgets = await AsyncStorage.getItem(`budgets_${user.id}`);
      if (savedBudgets) {
        setBudgets(JSON.parse(savedBudgets));
      } else {
        // Initialize with default budgets
        const defaultBudgets = BUDGET_CATEGORIES.map((cat, index) => ({
          id: String(index + 1),
          category: cat.name,
          icon: cat.icon,
          color: cat.color,
          spent: 0,
          budget: 0,
        }));
        setBudgets(defaultBudgets);
        await AsyncStorage.setItem(`budgets_${user.id}`, JSON.stringify(defaultBudgets));
      }
    } catch (error) {
      console.error("Error loading budgets:", error);
    }
  };
  loadBudgets();
}, [user]);
// Add this effect to reload categories when goals change
useEffect(() => {
  // Store goals in AsyncStorage for add-transaction to access
  if (user && goals.length > 0) {
    AsyncStorage.setItem(`goals_${user.id}`, JSON.stringify(goals));
  }
}, [goals, user]);
// Add this useEffect in BooksListView after your other useEffects
// Replace your existing goals useEffect with this:
useEffect(() => {
  const updateGoalSavedAmounts = () => {
    if (!user || goals.length === 0) return;
    
    const savingsKeywords = ['savings', 'goal', 'fund', 'deposit', 'save', 'emergency', 'contribution'];
    
    let needsUpdate = false;
    const updatedGoals = goals.map(goal => {
      let savedAmount = 0;
      const goalName = goal.name.toLowerCase();
      
      personalTransactions.forEach(transaction => {
        if (transaction.type === 'income') {
          const category = transaction.category?.toLowerCase() || "";
          const note = transaction.note?.toLowerCase() || "";
          
          const isForThisGoal = 
            category.includes(goalName) || 
            note.includes(goalName) ||
            savingsKeywords.some(keyword => category.includes(keyword));
          
          if (isForThisGoal) {
            savedAmount += transaction.amount;
          }
        }
      });
      
      if (goal.savedAmount !== savedAmount) {
        needsUpdate = true;
      }
      
      return { ...goal, savedAmount };
    });
    
    if (needsUpdate) {
      console.log("📊 Updating goal saved amounts from useEffect");
      setGoals(updatedGoals);
      if (user) {
        AsyncStorage.setItem(`goals_${user.id}`, JSON.stringify(updatedGoals));
      }
    }
  };
  
  updateGoalSavedAmounts();
}, [personalTransactions, user]); // ✅ Remove 'goals' from dependencies
// Add this with your other useEffects in BooksListView
// Add this with your other useRef declarations
const goalsUpdateRef = useRef(false);

// Replace your existing goals useFocusEffect with this:
useFocusEffect(
  useCallback(() => {
    if (currentPage === "goals" && !goalsUpdateRef.current) {
      goalsUpdateRef.current = true;
      console.log("🔄 Refreshing goals on focus");
      
      if (!user || goals.length === 0) {
        goalsUpdateRef.current = false;
        return;
      }
      
      const savingsKeywords = ['savings', 'goal', 'fund', 'deposit', 'save', 'emergency', 'contribution'];
      
      let needsUpdate = false;
      const updatedGoals = goals.map(goal => {
        let savedAmount = 0;
        const goalName = goal.name.toLowerCase();
        
        personalTransactions.forEach(transaction => {
          if (transaction.type === 'income') {
            const category = transaction.category?.toLowerCase() || "";
            const note = transaction.note?.toLowerCase() || "";
            
            const isForThisGoal = 
              category.includes(goalName) || 
              note.includes(goalName) ||
              savingsKeywords.some(keyword => category.includes(keyword));
            
            if (isForThisGoal) {
              savedAmount += transaction.amount;
            }
          }
        });
        
        if (goal.savedAmount !== savedAmount) {
          needsUpdate = true;
        }
        
        return { ...goal, savedAmount };
      });
      
      if (needsUpdate) {
        console.log("📊 Updating goal saved amounts");
        setGoals(updatedGoals);
        if (user) {
          AsyncStorage.setItem(`goals_${user.id}`, JSON.stringify(updatedGoals));
        }
      }
      
      // Reset the ref after a short delay
      setTimeout(() => {
        goalsUpdateRef.current = false;
      }, 500);
    }
  }, [currentPage, personalTransactions, user]) // ✅ Remove 'goals' from dependencies
);

// Update spent amounts based on personalTransactions
useEffect(() => {
  if (!user || budgets.length === 0) return;
  
  const updatedBudgets = budgets.map(budget => {
    let spent = 0;
    personalTransactions.forEach(transaction => {
      if (transaction.type === 'expense') {
        const category = transaction.category?.toLowerCase() || "";
        const budgetCategory = budget.category.toLowerCase();
        
        if (category.includes(budgetCategory) || 
            (budgetCategory === "food & dining" && (category.includes("food") || category.includes("restaurant"))) ||
            (budgetCategory === "bills & utilities" && (category.includes("bill") || category.includes("utility"))) ||
            category === budgetCategory) {
          spent += transaction.amount;
        }
      }
    });
    return { ...budget, spent };
  });
  
  setBudgets(updatedBudgets);
  AsyncStorage.setItem(`budgets_${user.id}`, JSON.stringify(updatedBudgets));
}, [personalTransactions, user]);
// Load goals from AsyncStorage
// Update goal saved amounts when transactions change
// Add this useEffect in BooksListView - FIXED (no infinite loop)
useEffect(() => {
  const updateGoalSavedAmounts = () => {
    if (!user || goals.length === 0) return;
    
    console.log("📊 Calculating goal saved amounts from transactions...");
    
    // Create a map of goalId -> savedAmount
    const goalSavings: { [goalId: string]: number } = {};
    
    // Initialize all goals with 0
    goals.forEach(goal => {
      goalSavings[goal.id] = 0;
    });
    
    // Process each transaction
    personalTransactions.forEach(transaction => {
      // Check if this transaction has a goalId
      const goalId = (transaction as any).goalId;
      
      if (goalId && goalSavings.hasOwnProperty(goalId)) {
        // ✅ This transaction is directly linked to a goal
        if (transaction.type === 'income') {
          goalSavings[goalId] += transaction.amount;
          console.log(`  ✅ Income ${transaction.amount} added to goal ${goalId}`);
        } else if (transaction.type === 'expense') {
          goalSavings[goalId] -= transaction.amount;
          console.log(`  ✅ Expense ${transaction.amount} subtracted from goal ${goalId}`);
        }
      }
    });
    
    // Update goals with new saved amounts
    const updatedGoals = goals.map(goal => ({
      ...goal,
      savedAmount: goalSavings[goal.id] || 0
    }));
    
    // Check if any goal's savedAmount changed
    const hasChanged = updatedGoals.some((goal, index) => 
      goal.savedAmount !== goals[index].savedAmount
    );
    
    if (hasChanged) {
      console.log("📊 Updating goal saved amounts");
      setGoals(updatedGoals);
      if (user) {
        AsyncStorage.setItem(`goals_${user.id}`, JSON.stringify(updatedGoals));
      }
    }
  };
  
  updateGoalSavedAmounts();
}, [personalTransactions, user]);
useEffect(() => {
  const loadGoals = async () => {
    if (!user) return;
    try {
      const savedGoals = await AsyncStorage.getItem(`goals_${user.id}`);
      if (savedGoals) {
        setGoals(JSON.parse(savedGoals));
      } else {
        // Default goals
        const defaultGoals = [
          { 
            id: "1", 
            name: "Emergency Fund", 
            icon: "shield", 
            color: "#3B82F6", 
            targetAmount: 10000, 
            savedAmount: 0,
            deadline: "2025-12-31",
            status: "active" as const
          },
          { 
            id: "2", 
            name: "New Car", 
            icon: "truck", 
            color: "#10B981", 
            targetAmount: 25000, 
            savedAmount: 0,
            deadline: "2026-06-30",
            status: "active" as const
          },
        ];
        setGoals(defaultGoals);
        await AsyncStorage.setItem(`goals_${user.id}`, JSON.stringify(defaultGoals));
      }
    } catch (error) {
      console.error("Error loading goals:", error);
    }
  };
  loadGoals();
}, [user]);
// Save budget
const saveBudget = async () => {
  if (!selectedBudgetCategory || !budgetAmount) {
    Alert.alert("Error", "Please select a category and enter budget amount");
    return;
  }
  
  const amount = parseFloat(budgetAmount);
  if (isNaN(amount) || amount <= 0) {
    Alert.alert("Error", "Please enter a valid budget amount");
    return;
  }
  
  const updatedBudgets = budgets.map(b => 
    b.category === selectedBudgetCategory 
      ? { ...b, budget: amount }
      : b
  );
  
  setBudgets(updatedBudgets);
  if (user) {
    await AsyncStorage.setItem(`budgets_${user.id}`, JSON.stringify(updatedBudgets));
  }
  
  setShowAddBudgetModal(false);
  setSelectedBudgetCategory("");
  setBudgetAmount("");
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  Alert.alert("Success", "Budget saved successfully");
};
// Save goal
const saveGoal = async () => {
  if (!newGoalName || !newGoalTarget) {
    Alert.alert("Error", "Please enter goal name and target amount");
    return;
  }
  
  const target = parseFloat(newGoalTarget);
  if (isNaN(target) || target <= 0) {
    Alert.alert("Error", "Please enter a valid target amount");
    return;
  }
  
  const goalColors = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899", "#EF4444", "#6366F1", "#14B8A6"];
  const randomColor = goalColors[Math.floor(Math.random() * goalColors.length)];
  
  let updatedGoals;
  if (editingGoalId) {
    updatedGoals = goals.map(g => 
      g.id === editingGoalId 
        ? { ...g, name: newGoalName, targetAmount: target, deadline: newGoalDeadline, icon: newGoalIcon }
        : g
    );
  } else {
    // In BooksListView, when saving goals:
const newGoal = {
  id: Date.now().toString(), // ✅ Ensure each goal has a unique ID
  name: newGoalName,
  icon: newGoalIcon,
  color: randomColor,
  targetAmount: target,
  savedAmount: 0,
  deadline: newGoalDeadline || undefined,
  status: "active" as const,
};
    updatedGoals = [...goals, newGoal];
  }
  
  setGoals(updatedGoals);
  if (user) {
    await AsyncStorage.setItem(`goals_${user.id}`, JSON.stringify(updatedGoals));
  }
  
  setShowAddGoalModal(false);
  setNewGoalName("");
  setNewGoalTarget("");
  setNewGoalIcon("target");
  setNewGoalDeadline("");
  setEditingGoalId(null);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  Alert.alert("Success", editingGoalId ? "Goal updated successfully" : "Goal created successfully");
};

// Delete goal
const deleteGoal = async (goalId: string) => {
  Alert.alert(
    "Delete Goal",
    "Are you sure you want to delete this goal?",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updatedGoals = goals.filter(g => g.id !== goalId);
          setGoals(updatedGoals);
          if (user) {
            await AsyncStorage.setItem(`goals_${user.id}`, JSON.stringify(updatedGoals));
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    ]
  );
};
  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    let filtered = personalTransactions;
    
    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter(tx => tx.type === filterType);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.category?.toLowerCase().includes(query) ||
        tx.note?.toLowerCase().includes(query) ||
        tx.type?.toLowerCase().includes(query)
      );
    }
    
    // Sort by date
    filtered = [...filtered].sort((a, b) => {
      if (sortOrder === "newest") {
        return b.createdAt - a.createdAt;
      } else {
        return a.createdAt - b.createdAt;
      }
    });
    
    return filtered;
  }, [personalTransactions, filterType, searchQuery, sortOrder]);
  // ===== MOVE ALL useCallback hooks for reports to top level =====
  const calculateNetWorth = useCallback(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
    
    txToUse.forEach(tx => {
      if (tx.type === 'income') totalIncome += tx.amount;
      else totalExpense += tx.amount;
    });
    
    const netWorth = totalIncome - totalExpense;
    return { totalIncome, totalExpense, netWorth };
  }, [transactions, allTransactionsForBusiness, selectedView]);
  
  const calculateAccountBalances = useCallback(() => {
    const accountBalances: { name: string; balance: number; type: string }[] = [];
    const businessBooks = books.filter(b => b.type === "business");
    const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
    
    businessBooks.forEach(book => {
      let balance = 0;
      const bookTxs = txToUse.filter(t => t.bookId === book.id);
      bookTxs.forEach(tx => {
        if (tx.type === 'income') balance += tx.amount;
        else balance -= tx.amount;
      });
      accountBalances.push({ name: book.name, balance, type: book.category || 'assets' });
    });
    
    return accountBalances;
  }, [books, transactions, allTransactionsForBusiness, selectedView]);
  
  // Replace your existing getReportData with this
// Replace the getReportData function with this updated version
const getReportData = useCallback((reportId: string) => {
  const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
  
  switch(reportId) {
    case "netWorth": {
      let totalIncome = 0;
      let totalExpense = 0;
      txToUse.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        else totalExpense += tx.amount;
      });
      return { totalIncome, totalExpense, netWorth: totalIncome - totalExpense };
    }
    
    case "accounts": {
      const accountBalances: { name: string; balance: number; type: string }[] = [];
      const businessBooks = books.filter(b => b.type === "business");
      businessBooks.forEach(book => {
        let balance = 0;
        const bookTxs = txToUse.filter(t => t.bookId === book.id);
        bookTxs.forEach(tx => {
          if (tx.type === 'income') balance += tx.amount;
          else balance -= tx.amount;
        });
        accountBalances.push({ name: book.name, balance, type: book.category || 'assets' });
      });
      return accountBalances;
    }
    
    case "incomeVsExpenses": {
      let totalIncome = 0;
      let totalExpense = 0;
      txToUse.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        else totalExpense += tx.amount;
      });
      return { income: totalIncome, expense: totalExpense, savings: totalIncome - totalExpense };
    }
    
    case "spendingByCategory": {
      const categorySpending: { [key: string]: number } = {};
      txToUse.forEach(tx => {
        if (tx.type === 'expense') {
          const cat = tx.category || 'Other';
          categorySpending[cat] = (categorySpending[cat] || 0) + tx.amount;
        }
      });
      return Object.entries(categorySpending)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);
    }
    
    case "cashFlow": {
      const monthlyData: { [key: string]: { income: number; expense: number } } = {};
      txToUse.forEach(tx => {
        const date = new Date(tx.date || tx.createdAt);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expense: 0 };
        if (tx.type === 'income') monthlyData[monthKey].income += tx.amount;
        else monthlyData[monthKey].expense += tx.amount;
      });
      return Object.entries(monthlyData)
        .map(([month, data]) => ({ month, ...data, net: data.income - data.expense }))
        .slice(-6);
    }
    
    // ✅ UPDATED: Return real budget data
    case "budgets": {
      const activeBudgets = budgets.filter(b => b.budget > 0);
      if (activeBudgets.length === 0) {
        return { budgets: [], message: "No budgets set yet" };
      }
      return activeBudgets.map(budget => ({
        category: budget.category,
        spent: budget.spent,
        budget: budget.budget,
        spentPercent: budget.budget > 0 ? (budget.spent / budget.budget) * 100 : 0,
        icon: budget.icon,
        color: budget.color
      }));
    }
    
    // ✅ UPDATED: Return real goal data
    case "goalProjections": {
      const activeGoals = goals.filter(g => g.status === "active");
      if (activeGoals.length === 0) {
        return { projections: [], message: "No active goals" };
      }
      return activeGoals.map(goal => ({
        name: goal.name,
        savedAmount: goal.savedAmount,
        targetAmount: goal.targetAmount,
        progress: (goal.savedAmount / goal.targetAmount) * 100,
        deadline: goal.deadline,
        icon: goal.icon,
        color: goal.color
      }));
    }
    
    case "recurring": {
      return { recurring: [], message: "Recurring transactions coming soon" };
    }
    
    case "transactions": {
      return txToUse.slice(0, 20);
    }
      
    default:
      return {};
  }
}, [books, transactions, allTransactionsForBusiness, selectedView, budgets, goals]);

// Add these functions after getReportData and before renderReportsContent





const selectNoneReports = useCallback(() => {
  setSelectedReports(new Set());
}, []);

const resetReports = useCallback(() => {
  setSelectedReports(new Set());
  setSelectedReport("netWorth");
}, []);

const handlePreview = useCallback((reportId: string) => {
  const REPORTS_CONFIG = [
    { id: "netWorth", name: "Net Worth", icon: "trending-up", color: "#3B82F6" },
    { id: "accounts", name: "Accounts", icon: "briefcase", color: "#10B981" },
    { id: "incomeVsExpenses", name: "Income vs Expenses", icon: "bar-chart-2", color: "#8B5CF6" },
    { id: "spendingByCategory", name: "Spending by Category", icon: "pie-chart", color: "#F59E0B" },
    { id: "cashFlow", name: "Cash Flow", icon: "activity", color: "#EC4899" },
    { id: "budgets", name: "Budgets", icon: "target", color: "#14B8A6" },
    { id: "goalProjections", name: "Goal Projections", icon: "flag", color: "#6366F1" },
    { id: "recurring", name: "Recurring", icon: "repeat", color: "#EF4444" },
    { id: "transactions", name: "Transactions", icon: "list", color: "#6B7280" },
  ];
  const report = REPORTS_CONFIG.find(r => r.id === reportId);
  const data = getReportData(reportId);
  setPreviewReport({ report, data });
  setShowPreviewModal(true);
}, [getReportData]);

const generatePDF = useCallback(async () => {
  const reportsToExport = Array.from(selectedReports);
  if (reportsToExport.length === 0) {
    Alert.alert("Error", "Please select at least one report to export");
    return;
  }
  
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  
  const REPORTS_CONFIG = [
    { id: "netWorth", name: "Net Worth", icon: "trending-up", color: "#3B82F6" },
    { id: "accounts", name: "Accounts", icon: "briefcase", color: "#10B981" },
    { id: "incomeVsExpenses", name: "Income vs Expenses", icon: "bar-chart-2", color: "#8B5CF6" },
    { id: "spendingByCategory", name: "Spending by Category", icon: "pie-chart", color: "#F59E0B" },
    { id: "cashFlow", name: "Cash Flow", icon: "activity", color: "#EC4899" },
    { id: "budgets", name: "Budgets", icon: "target", color: "#14B8A6" },
    { id: "goalProjections", name: "Goal Projections", icon: "flag", color: "#6366F1" },
    { id: "recurring", name: "Recurring", icon: "repeat", color: "#EF4444" },
    { id: "transactions", name: "Transactions", icon: "list", color: "#6B7280" },
  ];
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Financial Reports - Felosak</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; margin: 0; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #3B82F6; padding-bottom: 20px; }
        .header h1 { color: #3B82F6; margin: 0; font-size: 28px; }
        .header p { color: #666; margin: 5px 0 0; font-size: 12px; }
        .report-section { margin-bottom: 30px; background: #F9FAFB; padding: 20px; border-radius: 12px; }
        .report-title { font-size: 18px; font-weight: bold; color: #1F2937; margin-bottom: 15px; border-left: 3px solid #3B82F6; padding-left: 12px; }
        .stats-grid { display: flex; gap: 20px; margin-bottom: 20px; }
        .stat-card { flex: 1; background: white; padding: 15px; border-radius: 10px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stat-label { font-size: 12px; color: #6B7280; margin-bottom: 5px; }
        .stat-value { font-size: 24px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #3B82F6; color: white; padding: 10px; text-align: left; font-size: 12px; }
        td { padding: 8px 10px; border-bottom: 1px solid #E5E7EB; font-size: 12px; }
        .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #E5E7EB; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Financial Reports</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
        <p>${selectedView === "business" ? "Business" : "Personal"} View</p>
      </div>
  `;
  
  let reportsHtml = "";
  for (const reportId of reportsToExport) {
    const report = REPORTS_CONFIG.find(r => r.id === reportId);
    const data = getReportData(reportId);
    
    reportsHtml += `<div class="report-section">`;
    reportsHtml += `<div class="report-title">${report?.name}</div>`;
    
    if (reportId === "netWorth") {
      reportsHtml += `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">Total Income</div><div class="stat-value" style="color:#10B981">${getCurrencyCode()} ${(data as any).totalIncome?.toLocaleString() || 0}</div></div>
          <div class="stat-card"><div class="stat-label">Total Expenses</div><div class="stat-value" style="color:#EF4444">${getCurrencyCode()} ${(data as any).totalExpense?.toLocaleString() || 0}</div></div>
          <div class="stat-card"><div class="stat-label">Net Worth</div><div class="stat-value" style="color:#3B82F6">${getCurrencyCode()} ${(data as any).netWorth?.toLocaleString() || 0}</div></div>
        </div>
      `;
    } else if (reportId === "accounts") {
      reportsHtml += `<table><thead><tr><th>Account Name</th><th>Balance</th></tr></thead><tbody>`;
      (data as any[]).forEach(acc => {
        reportsHtml += `<tr><td>${acc.name}</td><td style="color:${acc.balance >= 0 ? '#10B981' : '#EF4444'}">${getCurrencyCode()} ${Math.abs(acc.balance).toLocaleString()}</td></tr>`;
      });
      reportsHtml += `</tbody></table>`;
    } else if (reportId === "incomeVsExpenses") {
      reportsHtml += `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">Income</div><div class="stat-value" style="color:#10B981">${getCurrencyCode()} ${(data as any).income?.toLocaleString() || 0}</div></div>
          <div class="stat-card"><div class="stat-label">Expenses</div><div class="stat-value" style="color:#EF4444">${getCurrencyCode()} ${(data as any).expense?.toLocaleString() || 0}</div></div>
          <div class="stat-card"><div class="stat-label">Savings</div><div class="stat-value" style="color:#3B82F6">${getCurrencyCode()} ${(data as any).savings?.toLocaleString() || 0}</div></div>
        </div>
      `;
    } else if (reportId === "spendingByCategory") {
      reportsHtml += `<table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>`;
      (data as any[]).forEach(cat => {
        reportsHtml += `<tr><td>${cat.name}</td><td>${getCurrencyCode()} ${cat.amount.toLocaleString()}</td></tr>`;
      });
      reportsHtml += `</tbody></table>`;
    } else if (reportId === "cashFlow") {
      reportsHtml += `<table><thead><tr><th>Month</th><th>Income</th><th>Expense</th><th>Net</th></tr></thead><tbody>`;
      (data as any[]).forEach(month => {
        reportsHtml += `<tr><td>${month.month}</td><td style="color:#10B981">${getCurrencyCode()} ${month.income.toLocaleString()}</td><td style="color:#EF4444">${getCurrencyCode()} ${month.expense.toLocaleString()}</td><td style="color:#3B82F6">${getCurrencyCode()} ${month.net.toLocaleString()}</td></tr>`;
      });
      reportsHtml += `</tbody></table>`;
    } else if (reportId === "transactions") {
      reportsHtml += `<table><thead><tr><th>Date</th><th>Category</th><th>Type</th><th>Amount</th></tr></thead><tbody>`;
      (data as any[]).forEach(tx => {
        reportsHtml += `<tr><td>${formatDate(tx.date || tx.createdAt)}</td><td>${tx.category}</td><td style="color:${tx.type === 'income' ? '#10B981' : '#EF4444'}">${tx.type}</td><td>${getCurrencyCode()} ${tx.amount.toLocaleString()}</td></tr>`;
      });
      reportsHtml += `</tbody></table>`;
    } else {
      reportsHtml += `<p style="color:#6B7280; text-align:center;">${(data as any).message || "Data coming soon"}</p>`;
    }
    
    reportsHtml += `</div>`;
  }
  
  const fullHtml = htmlContent + reportsHtml + `<div class="footer"><p>Generated from Felosak App</p></div></body></html>`;
  
  if (Platform.OS === 'web') {
    const win = window.open();
    win?.document.write(fullHtml);
    win?.document.close();
    win?.print();
    Alert.alert("Success", "Print dialog opened. You can save as PDF.");
  } else {
    const { uri } = await Print.printToFileAsync({ html: fullHtml });
    await Sharing.shareAsync(uri);
    Alert.alert("Success", "PDF generated and shared!");
  }
}, [selectedReports, getReportData, selectedView]);

// Add these calculation functions after your state declarations and before getReportData



// ADD THIS FUNCTION
const calculateSpendingByCategory = useCallback(() => {
  const categorySpending: { [key: string]: number } = {};
  const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
  
  txToUse.forEach(tx => {
    if (tx.type === 'expense') {
      const cat = tx.category || 'Other';
      categorySpending[cat] = (categorySpending[cat] || 0) + tx.amount;
    }
  });
  
  return Object.entries(categorySpending)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}, [transactions, allTransactionsForBusiness, selectedView]);

// ADD THIS FUNCTION
const calculateCashFlow = useCallback(() => {
  const monthlyData: { [key: string]: { income: number; expense: number } } = {};
  const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
  
  txToUse.forEach(tx => {
    const date = new Date(tx.date || tx.createdAt);
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expense: 0 };
    if (tx.type === 'income') monthlyData[monthKey].income += tx.amount;
    else monthlyData[monthKey].expense += tx.amount;
  });
  
  return Object.entries(monthlyData)
    .map(([month, data]) => ({ month, ...data, net: data.income - data.expense }))
    .slice(-6);
}, [transactions, allTransactionsForBusiness, selectedView]);


  const toggleReportSelection = useCallback((reportId: string) => {
    setSelectedReports(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(reportId)) newSelected.delete(reportId);
      else newSelected.add(reportId);
      return newSelected;
    });
  }, []);
  
  const selectAllReports = useCallback(() => {
    const allIds = new Set(REPORTS.map(r => r.id));
    setSelectedReports(allIds);
  }, []);
  // Update when external changes
  useEffect(() => {
    setSelectedView(externalSelectedTab);
  }, [externalSelectedTab]);
  
  // Update parent when changed
  const handleViewChange = (view: BookType) => {
  console.log("🔄 Switching view to:", view); // ← Add this
  setSelectedView(view);
  onTabChange(view);
  setCurrentPage("home");
};
  // Add these functions to load documents (at top level, after other useEffects)
const loadDocuments = useCallback(async () => {
  if (!user) return;
  
  try {
    console.log("Loading all documents for user");
    const q = query(
      collection(db, 'documents'),
      where('userId', '==', user.id)
    );
    const snapshot = await getDocs(q);
    const fetchedDocs: Document[] = [];
    snapshot.forEach(doc => {
      fetchedDocs.push({ id: doc.id, ...doc.data() } as Document);
    });
    console.log("Loaded", fetchedDocs.length, "documents");
    setDocumentsList(fetchedDocs);
  } catch (error) {
    console.error('Error loading documents:', error);
  }
}, [user]);

// Add useEffect to load documents
useEffect(() => {
  loadDocuments();
}, [loadDocuments, refreshTrigger]);
// Add these with your other useCallback functions
const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Due on Receipt", "End of Month"];
const CURRENCIES = ["KWD", "USD", "EUR", "GBP", "SAR", "AED"];

const loadClients = useCallback(async () => {
  if (!user) return;
  try {
    const q = query(
      collection(db, 'clients'),
      where('userId', '==', user.id)
    );
    const snapshot = await getDocs(q);
    const fetchedClients: Client[] = [];
    snapshot.forEach(doc => {
      fetchedClients.push({ id: doc.id, ...doc.data() } as Client);
    });
    setClients(fetchedClients);
  } catch (error) {
    console.error('Error loading clients:', error);
  }
}, [user]);

useEffect(() => {
  loadClients();
}, [loadClients, refreshTrigger]);

const resetClientForm = () => {
  setClientFormName("");
  setClientFormCompany("");
  setClientFormEmail("");
  setClientFormPhone("");
  setClientFormCurrency(getCurrencyCode());
  setClientFormPaymentTerms("Net 30");
  setClientFormTaxId("");
  setClientFormInternalNotes("");
  setClientFormStatus("active");
  setIsEditingClient(false);
  setSelectedClient(null);
};


const saveClient = async () => {
  console.log("🔵🔵🔵 SAVE CLIENT FUNCTION STARTED 🔵🔵🔵");
  console.log("🔵 user:", user?.id);
  console.log("🔵 clientFormName:", clientFormName);
  console.log("🔵 isEditingClient:", isEditingClient);
  console.log("🔵 selectedClient:", selectedClient?.id);
  console.log("🔵 isSubmittingClient BEFORE:", isSubmittingClient);
  
  if (!clientFormName.trim()) {
    console.log("🔴 ERROR: Client name is empty");
    Alert.alert("Error", "Please enter client name");
    return;
  }
  
  if (!user) {
    console.log("🔴 ERROR: No user logged in");
    Alert.alert("Error", "You must be logged in");
    return;
  }
  
  console.log("🔵 Setting isSubmittingClient to TRUE");
  setIsSubmittingClient(true);
  
  try {
    const clientData = {
      name: clientFormName.trim(),
      company: clientFormCompany.trim(),
      email: clientFormEmail.trim(),
      phone: clientFormPhone.trim(),
      currency: clientFormCurrency,
      paymentTerms: clientFormPaymentTerms,
      taxId: clientFormTaxId.trim(),
      internalNotes: clientFormInternalNotes.trim(),
      status: clientFormStatus,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      userId: user.id,
    };
    
    console.log("🔵 clientData:", clientData);
    
    if (isEditingClient && selectedClient) {
      console.log("🔵 UPDATING existing client:", selectedClient.id);
      const clientRef = doc(db, 'clients', selectedClient.id);
      await updateDoc(clientRef, { 
        ...clientData, 
        updatedAt: Timestamp.now() 
      });
      console.log("✅ Client updated successfully");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Client updated successfully");
    } else {
      console.log("🔵 CREATING new client");
      await addDoc(collection(db, 'clients'), clientData);
      console.log("✅ Client created successfully");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Client created successfully");
    }
    
    console.log("🔵 Loading clients...");
    await loadClients();
    console.log("🔵 Resetting form...");
    resetClientForm();
    console.log("🔵 Closing modal...");
    setShowCreateClientModal(false);
    
  } catch (error: any) {
    console.error("🔴 ERROR saving client:", error);
    Alert.alert("Error", error.message || "Failed to save client");
  } finally {
    console.log("🔵 Setting isSubmittingClient to FALSE");
    setIsSubmittingClient(false);
  }
  
  console.log("🔵🔵🔵 SAVE CLIENT FUNCTION COMPLETED 🔵🔵🔵");
};

const editClient = (client: Client) => {
  setSelectedClient(client);
  setClientFormName(client.name);
  setClientFormCompany(client.company || "");
  setClientFormEmail(client.email || "");
  setClientFormPhone(client.phone || "");
  setClientFormCurrency(client.currency || getCurrencyCode());
  setClientFormPaymentTerms(client.paymentTerms || "Net 30");
  setClientFormTaxId(client.taxId || "");
  setClientFormInternalNotes(client.internalNotes || "");
  setClientFormStatus(client.status || "active");
  setIsEditingClient(true);
  setShowCreateClientModal(true);
};

const deleteClient = async (client: Client) => {
  Alert.alert(
    "Delete Client",
    `Are you sure you want to delete "${client.name}"?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'clients', client.id));
            await loadClients();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Success", "Client deleted successfully");
          } catch (error) {
            console.error("Error deleting client:", error);
            Alert.alert("Error", "Failed to delete client");
          }
        }
      }
    ]
  );
};

const filteredClients = useMemo(() => {
  return clients.filter(client => {
    if (clientFilterStatus === "all") return true;
    return client.status === clientFilterStatus;
  });
}, [clients, clientFilterStatus]);
// Add PDF generation function
const generateDocumentPDF = useCallback(async (document: Document) => {
  if (!document) return;
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const config = { Invoice: { color: "#3B82F6" }, Quote: { color: "#10B981" }, "Credit Note": { color: "#8B5CF6" }, "Purchase Order": { color: "#EC4899" } };
    const docConfig = config[document.type as keyof typeof config] || config.Invoice;
    const currencyCode = getCurrencyCode();
    
    const formatAmount = (amount: number) => `${currencyCode} ${amount.toLocaleString('en-EG')}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${document.number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; margin: 0; color: #333; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid ${docConfig.color}; padding-bottom: 20px; }
          .header h1 { color: ${docConfig.color}; margin: 0; font-size: 24px; }
          .doc-info { background: #F9FAFB; padding: 15px; border-radius: 10px; margin-bottom: 20px; }
          .doc-number { font-size: 16px; font-weight: bold; color: ${docConfig.color}; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .label { font-weight: bold; color: #666; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header"><h1>${document.type}</h1></div>
        <div class="doc-info">
          <div class="doc-number">${document.number}</div>
          <div class="row"><span class="label">Party Name:</span><span>${document.partyName}</span></div>
          <div class="row"><span class="label">Date:</span><span>${formatDate(document.date)}</span></div>
          <div class="row"><span class="label">Amount:</span><span style="color: ${docConfig.color}; font-weight: bold;">${formatAmount(document.amount)}</span></div>
        </div>
        <div class="footer"><p>Generated from Felosak App</p></div>
      </body>
      </html>
    `;
    
    if (Platform.OS === 'web') {
      const win = window.open();
      win?.document.write(htmlContent);
      win?.document.close();
      win?.print();
      Alert.alert("Success", "Print dialog opened. You can save as PDF.");
    } else {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
      Alert.alert("Success", "PDF generated and shared!");
    }
  } catch (error) {
    console.error("PDF Error:", error);
    Alert.alert("Error", "Failed to generate PDF");
  }
}, []);
// Refresh personal transactions when the tab is focused
useFocusEffect(
  useCallback(() => {
    const loadPersonalTransactions = async () => {
      if (!user) return;
      try {
        console.log("🔄 Refreshing personal transactions on focus");
        const q = query(
          collection(db, 'transactions'), 
          where('userId', '==', user.id), 
          where('bookId', '==', null)
        );
        const snapshot = await getDocs(q);
        const fetchedTransactions: Transaction[] = [];
        snapshot.forEach(doc => {
          fetchedTransactions.push({ 
            id: doc.id, 
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.getTime() || Date.now()
          } as Transaction);
        });
        setPersonalTransactions(fetchedTransactions);
        console.log("✅ Loaded", fetchedTransactions.length, "personal transactions");
      } catch (error) {
        console.error('Error loading personal transactions:', error);
      }
    };
    loadPersonalTransactions();
  }, [user])
);
  useFocusEffect(useCallback(() => { 
    loadCurrency();
    setRefreshTrigger(prev => prev + 1);
  }, []));
  
  // Load ALL transactions for business accounts (when no active book)
  useEffect(() => {
    const loadAllTransactionsForBusiness = async () => {
      if (!user || selectedView !== "business") return;
      
      try {
        console.log("Loading all transactions for business view");
        const q = query(collection(db, 'transactions'), where('userId', '==', user.id));
        const snapshot = await getDocs(q);
        const fetchedTransactions: Transaction[] = [];
        snapshot.forEach(doc => {
          fetchedTransactions.push({ 
            id: doc.id, 
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.getTime() || Date.now()
          } as Transaction);
        });
        setAllTransactionsForBusiness(fetchedTransactions);
        console.log("Loaded", fetchedTransactions.length, "transactions for business view");
      } catch (error) {
        console.error('Error loading business transactions:', error);
      }
    };
    
    loadAllTransactionsForBusiness();
  }, [user, selectedView, refreshTrigger]);
  
  // Load personal transactions (no bookId)
  // Load personal transactions (bookId == "personal")


// Refresh personal transactions when the tab is focused
useFocusEffect(
  useCallback(() => {
    const loadPersonalTransactions = async () => {
      if (!user) return;
      try {
        console.log("🔄 Refreshing personal transactions on focus");
        const q = query(
          collection(db, 'transactions'), 
          where('userId', '==', user.id), 
          where('bookId', '==', 'personal') // ✅ Filter by "personal"
        );
        const snapshot = await getDocs(q);
        const fetchedTransactions: Transaction[] = [];
        snapshot.forEach(doc => {
          fetchedTransactions.push({ 
            id: doc.id, 
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.getTime() || Date.now()
          } as Transaction);
        });
        setPersonalTransactions(fetchedTransactions);
        console.log("✅ Loaded", fetchedTransactions.length, "personal transactions on focus");
      } catch (error) {
        console.error('Error loading personal transactions:', error);
      }
    };
    loadPersonalTransactions();
  }, [user])
);

const personalStats = useMemo(() => {
  let totalIncome = 0;
  let totalExpense = 0;
  let investmentTotal = 0;
  let debtTotal = 0;
  
  console.log("🔵 Calculating personal stats for", personalTransactions.length, "transactions");
  
  personalTransactions.forEach(transaction => {
    if (transaction.type === 'income') {
      totalIncome += transaction.amount;
      
      // ✅ Check if income is from investment
      const isInvestmentIncome = INCOME_INVESTMENT_CATEGORIES.includes(transaction.category);
      // ✅ Check if income is from debt
      const isDebtIncome = INCOME_DEBT_CATEGORIES.includes(transaction.category);
      
      if (isInvestmentIncome) {
        investmentTotal += transaction.amount;
        console.log(`✅ Investment INCOME: ${transaction.category} - ${transaction.amount}`);
      }
      if (isDebtIncome) {
        debtTotal += transaction.amount;
        console.log(`✅ Debt INCOME: ${transaction.category} - ${transaction.amount}`);
      }
      
    } else if (transaction.type === 'expense') {
      totalExpense += transaction.amount;
      
      // ✅ Check if expense is an investment
      const isInvestmentExpense = EXPENSE_INVESTMENT_CATEGORIES.includes(transaction.category);
      // ✅ Check if expense is a debt payment
      const isDebtExpense = EXPENSE_DEBT_CATEGORIES.includes(transaction.category);
      
      if (isInvestmentExpense) {
        investmentTotal += transaction.amount;
        console.log(`✅ Investment EXPENSE: ${transaction.category} - ${transaction.amount}`);
      }
      if (isDebtExpense) {
        debtTotal += transaction.amount;
        console.log(`✅ Debt EXPENSE: ${transaction.category} - ${transaction.amount}`);
      }
    }
  });
  
  console.log("📊 FINAL STATS:", { 
    totalIncome, 
    totalExpense, 
    investmentTotal, 
    debtTotal 
  });
  
  const safeToSpend = totalIncome * 0.5;
  const spentAmount = totalExpense;
  const spentPercentage = safeToSpend > 0 ? (spentAmount / safeToSpend) * 100 : 0;
  
  return {
    totalBalance: totalIncome - totalExpense,
    totalIncome,
    totalExpense,
    investmentTotal,
    debtTotal,
    safeToSpend,
    spentPercentage: Math.min(spentPercentage, 100),
    isHealthy: spentPercentage < 70,
  };
}, [personalTransactions]);


  // Calculate business view stats from ALL transactions
  // Calculate business view stats - INCOME as ASSETS, EXPENSES as LIABILITIES
const businessStats = useMemo(() => {
  let totalIncome = 0;
  let totalExpense = 0;
  
  const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
  
  // Calculate total income and expenses across ALL business books
  txToUse.forEach(transaction => {
    if (transaction.type === 'income') {
      totalIncome += transaction.amount;
    } else if (transaction.type === 'expense') {
      totalExpense += transaction.amount;
    }
  });
  
  // Income = Assets, Expenses = Liabilities
  const totalAssets = totalIncome;
  const totalLiabilities = totalExpense;
  const netWorth = totalAssets - totalLiabilities;
  
  console.log("📊 Business Stats:", { 
    totalIncome, 
    totalExpense, 
    totalAssets, 
    totalLiabilities, 
    netWorth 
  });
  
  return { totalAssets, totalLiabilities, netWorth };
}, [transactions, allTransactionsForBusiness, selectedView]);

  // Categorize business books
  const categorizedBooks = useMemo(() => {
    console.log("🔄 Recalculating categorizedBooks, books count:", books.length);
    
    const categories = {
      banks: [] as CashBook[],
      creditCards: [] as CashBook[],
      investments: [] as CashBook[],
      assets: [] as CashBook[],
    };
    
    books.forEach(book => {
      console.log(`Processing book: ${book.name}, type: ${book.type}, category: ${book.category}`);
      
      if (book.type === "business") {
        const category = book.category || "assets";
        console.log(`  → Adding to category: ${category}`);
        switch (category) {
          case "bank":
            categories.banks.push(book);
            break;
          case "credit-card":
            categories.creditCards.push(book);
            break;
          case "investment":
            categories.investments.push(book);
            break;
          default:
            categories.assets.push(book);
        }
      }
    });
    
    console.log("📊 Categorized results:", {
      banks: categories.banks.length,
      creditCards: categories.creditCards.length,
      investments: categories.investments.length,
      assets: categories.assets.length,
    });
    
    return categories;
  }, [books]);

  // Get book balance
  const getBookBalance = useCallback((bookId: string) => {
    let income = 0;
    let expense = 0;
    const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
    const bookTransactions = txToUse?.filter(t => t.bookId === bookId) || [];
    
    bookTransactions.forEach(transaction => {
      if (transaction.type === 'income') income += transaction.amount;
      else expense += transaction.amount;
    });
    
    return income - expense;
  }, [transactions, allTransactionsForBusiness, selectedView]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const getGreetingName = () => {
    if (profileName) return profileName.split(' ')[0];
    if (user?.displayName) return user.displayName.split(' ')[0];
    if (user?.email) return user.email.split('@')[0];
    return "User";
  };

  const handleLogout = useCallback(async () => {
    setProfileModalVisible(false);
    await logout();
    router.replace("/auth");
  }, [logout]);

  const handleDeleteAccount = useCallback(async () => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.id);
      await deleteDoc(userRef);
      
      const booksQuery = query(collection(db, 'books'), where('userId', '==', user.id));
      const booksSnapshot = await getDocs(booksQuery);
      for (const bookDoc of booksSnapshot.docs) {
        await deleteDoc(bookDoc.ref);
      }
      
      const transactionsQuery = query(collection(db, 'transactions'), where('userId', '==', user.id));
      const transactionsSnapshot = await getDocs(transactionsQuery);
      for (const transactionDoc of transactionsSnapshot.docs) {
        await deleteDoc(transactionDoc.ref);
      }
      
      await user.delete();
      await AsyncStorage.clear();
      router.replace("/auth");
    } catch (error) {
      console.error("Error deleting account:", error);
      Alert.alert("Error", "Failed to delete account.");
    }
  }, [user]);

  const handleConfirmDelete = useCallback(() => { 
    if (bookToDelete) { 
      deleteBook(bookToDelete.id); 
      setRefreshTrigger(prev => prev + 1);
    } 
    setShowDeleteModal(false); 
    setBookToDelete(null); 
  }, [bookToDelete, deleteBook]);

  const handleOpenBook = useCallback((book: CashBook) => { 
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
    setActiveBook(book); 
  }, [setActiveBook]);

  const refreshProfileData = useCallback(async () => {
    if (!user) return;
    try {
      const savedData = await AsyncStorage.getItem(`${STORAGE_KEY}_${user.id}`);
      if (savedData) {
        const profile = JSON.parse(savedData);
        setProfileName(profile.name || "");
        setProfilePhoto(profile.photo || "");
      }
    } catch (error) {
      console.error("Error refreshing profile:", error);
    }
  }, [user]);

  const handleCreateBook = async () => {
  if (!newBookName.trim()) {
    Alert.alert("Error", "Please enter a book name");
    return;
  }
  
  setIsCreating(true);
  try {
    const icon = newBookType === "business" ? 
      (newBookCategory === "bank" ? "🏦" : 
       newBookCategory === "credit-card" ? "💳" :
       newBookCategory === "investment" ? "📈" : "📦") : "📒";
    
    // For business accounts, ALWAYS set the category
    // For personal books, category is undefined
    let categoryValue = undefined;
    if (newBookType === "business") {
      // If it's business, it MUST have a category (bank, credit-card, investment, assets)
      categoryValue = newBookCategory || "assets";
    }
    
    const newBook = {
      name: newBookName,
      description: newBookDescription || "",
      type: newBookType, // "business" or "personal"
      category: categoryValue, // For business: "bank", "credit-card", "investment", "assets"
      isCloud: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      userId: user?.id || "",
      role: "owner",
      icon: icon,
      color: "#" + Math.floor(Math.random()*16777215).toString(16),
    };
    
    console.log("🔵 Creating book with data:", newBook);
    
    const booksRef = collection(db, 'books');
    await addDoc(booksRef, newBook);
    
    // Refresh books
    await refreshBooks();
    setRefreshTrigger(prev => prev + 1);
    
    Alert.alert("Success", `${newBookType === "personal" ? "Book" : "Account"} created successfully`);
    setShowCreateBookModal(false);
    setNewBookName("");
    setNewBookDescription("");
    setNewBookCategory("assets");
    
  } catch (error) {
    console.error("Error creating book:", error);
    Alert.alert("Error", "Failed to create account");
  } finally {
    setIsCreating(false);
  }
};
// Separate function for creating BUSINESS ACCOUNTS
// Function for creating BUSINESS ACCOUNTS
const handleCreateAccount = async () => {
  console.log("🔵🔵🔵 handleCreateAccount CALLED 🔵🔵🔵");
  
  if (!newBookName.trim()) {
    Alert.alert("Error", "Please enter an account name");
    return;
  }
  
  if (!user) {
    Alert.alert("Error", "You must be logged in");
    return;
  }
  
  // Make sure a category is selected for accounts
  if (!newBookCategory || newBookCategory === "book") {
    Alert.alert("Error", "Please select an account type (Bank, Credit Card, Investment, or Assets)");
    return;
  }
  
  setIsCreating(true);
  try {
    const icon = newBookCategory === "bank" ? "🏦" : 
                 newBookCategory === "credit-card" ? "💳" :
                 newBookCategory === "investment" ? "📈" : "📦";
    
    const newAccountData = {
      name: newBookName,
      description: newBookDescription || "",
      type: "business", // ✅ Always business
      category: newBookCategory, // ✅ bank, credit-card, investment, assets
      isCloud: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      userId: user.id,
      role: "owner",
      icon: icon,
      color: "#" + Math.floor(Math.random()*16777215).toString(16),
    };
    
    console.log("🔵 Creating ACCOUNT with data:", newAccountData);
    
    const booksRef = collection(db, 'books');
    await addDoc(booksRef, newAccountData);
    
    // Refresh books
    await refreshBooks();
    setRefreshTrigger(prev => prev + 1);
    
    Alert.alert("Success", "Account created successfully!");
    setShowCreateBookModal(false);
    setNewBookName("");
    setNewBookDescription("");
    setNewBookCategory("assets");
    
  } catch (error) {
    console.error("Error creating account:", error);
    Alert.alert("Error", "Failed to create account");
  } finally {
    setIsCreating(false);
  }
};
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const bookCategories = useMemo(() => [
    { id: 'banks', name: 'BANK ACCOUNTS', icon: 'briefcase', color: '#3B82F6', books: categorizedBooks.banks },
    { id: 'creditCards', name: 'CREDIT CARDS', icon: 'credit-card', color: '#EF4444', books: categorizedBooks.creditCards },
    { id: 'investments', name: 'INVESTMENTS', icon: 'trending-up', color: '#10B981', books: categorizedBooks.investments },
    { id: 'assets', name: 'ASSETS', icon: 'package', color: '#F59E0B', books: categorizedBooks.assets },
  ], [categorizedBooks]);

  const activeBookCategories = useMemo(() => {
    console.log("🔄 Computing activeBookCategories, categorizedBooks:", {
      banks: categorizedBooks.banks.length,
      creditCards: categorizedBooks.creditCards.length,
      investments: categorizedBooks.investments.length,
      assets: categorizedBooks.assets.length,
    });
    const filtered = bookCategories.filter(cat => cat.books.length > 0);
    console.log("🔄 activeBookCategories result:", filtered.map(c => c.name));
    return filtered;
  }, [bookCategories, refreshTrigger]);
  
  // Force update when books change
  useEffect(() => {
    console.log("Books changed, forcing refresh");
    setRefreshTrigger(prev => prev + 1);
  }, [books]);
  
  useEffect(() => {
    if (selectedView === "business") {
      console.log("Business view selected, refreshing data");
      setRefreshTrigger(prev => prev + 1);
      refreshBooks();
    }
  }, [selectedView]);
  
  const handleAddPersonalTransaction = () => {
  // Pass a parameter to indicate this is a personal transaction
  router.push({
    pathname: "/add-transaction",
    params: { mode: "personal" }
  });
};

  // Render Accounts Page (Personal)
  // Render Accounts Page (Business) - Shows BUSINESS ACCOUNTS with transactions
// Render Accounts Page (Business) - Shows ONLY BUSINESS ACCOUNTS with transactions
// Render Accounts Page (Business) - Shows ONLY BUSINESS ACCOUNTS
const renderAccountsContent = () => {
  // Get ONLY business accounts (must have category and NOT be "book")
  const businessAccounts = books.filter(b => 
    b.type === "business" && 
    b.category && 
    b.category !== "book" &&
    ['bank', 'credit-card', 'investment', 'assets'].includes(b.category)
  );
  
  console.log("📊 Business Accounts found:", businessAccounts.length);
  console.log("📊 Account names:", businessAccounts.map(b => b.name));
  
  // Categorize business accounts
  const categorizedAccounts = {
    banks: businessAccounts.filter(b => b.category === "bank"),
    creditCards: businessAccounts.filter(b => b.category === "credit-card"),
    investments: businessAccounts.filter(b => b.category === "investment"),
    assets: businessAccounts.filter(b => b.category === "assets"),
  };
  
  const accountCategories = [
    { id: 'banks', name: 'BANK ACCOUNTS', icon: 'briefcase', color: '#3B82F6', books: categorizedAccounts.banks },
    { id: 'creditCards', name: 'CREDIT CARDS', icon: 'credit-card', color: '#EF4444', books: categorizedAccounts.creditCards },
    { id: 'investments', name: 'INVESTMENTS', icon: 'trending-up', color: '#10B981', books: categorizedAccounts.investments },
    { id: 'assets', name: 'ASSETS', icon: 'package', color: '#F59E0B', books: categorizedAccounts.assets },
  ].filter(cat => cat.books.length > 0);
  
  // Toggle account expansion
  const toggleAccountExpansion = (bookId: string) => {
    setExpandedAccountId(expandedAccountId === bookId ? null : bookId);
  };
  
  // Get transactions for a specific account
  const getAccountTransactions = (bookId: string) => {
    const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
    return txToUse?.filter(t => t.bookId === bookId) || [];
  };
  
  return (
    <View style={styles.accountsSection}>
      <View style={styles.businessHeader}>
        <Text style={styles.businessTitle}>Accounts</Text>
        <View style={styles.businessHeaderButtons}>
          <Pressable 
            onPress={() => { 
              setNewBookType("business"); 
              setNewBookCategory("assets");
              setShowCreateBookModal(true); 
            }} 
            style={styles.businessAddAccountBtn}
          >
            <Feather name="plus" size={16} color="#3B82F6" />
            <Text style={styles.businessAddAccountText}>Add Account</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/add-transaction")} style={styles.businessAddTransBtn}>
            <Feather name="plus-circle" size={16} color="#FFFFFF" />
            <Text style={styles.businessAddTransText}>Add Transaction</Text>
          </Pressable>
        </View>
      </View>
      
      {accountCategories.length > 0 ? (
        accountCategories.map((category) => (
          <View key={category.id} style={styles.accountCategorySection}>
            <Text style={styles.accountCategoryTitle}>{category.name}</Text>
            <View style={styles.accountCardsContainer}>
              {category.books.map((book) => {
                const balance = getBookBalance(book.id);
                const isLinked = book.userId !== user?.id;
                const bookTransactions = getAccountTransactions(book.id);
                const isExpanded = expandedAccountId === book.id;
                
                return (
                  <View key={book.id} style={styles.bookContainer}>
                    {/* Account Card - Click to expand */}
                    <Pressable 
                      onPress={() => toggleAccountExpansion(book.id)} 
                      style={styles.accountCard}
                    >
                      <View style={[styles.accountCardIcon, { backgroundColor: `${category.color}15` }]}>
                        <Feather name={category.icon as any} size={22} color={category.color} />
                      </View>
                      <View style={styles.accountCardInfo}>
                        <Text style={styles.accountCardName}>{book.name}</Text>
                        <View style={styles.accountCardChips}>
                          {isLinked && (
                            <View style={[styles.chip, styles.linkedChip]}>
                              <Feather name="link" size={10} color="#10B981" />
                              <Text style={styles.chipTextLinked}>Linked</Text>
                            </View>
                          )}
                          <View style={[styles.chip, styles.businessChip]}>
                            <Feather name="briefcase" size={10} color="#F59E0B" />
                            <Text style={styles.chipTextBusiness}>Business</Text>
                          </View>
                          <View style={[styles.chip, { backgroundColor: '#E5E7EB' }]}>
                            <Text style={[styles.chipTextBusiness, { color: '#6B7280' }]}>
                              {bookTransactions.length} txns
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.accountCardBalance, { color: balance >= 0 ? '#10B981' : '#EF4444' }]}>
                          {getCurrencyCode()} {Math.abs(balance).toLocaleString('en-EG')}
                        </Text>
                        <Feather 
                          name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                          size={20} 
                          color="#9CA3AF" 
                        />
                      </View>
                    </Pressable>
                    
                    {/* Expanded Transactions List */}
                    {isExpanded && (
                      <View style={styles.expandedTransactionsContainer}>
                        <View style={styles.expandedHeader}>
                          <Text style={styles.expandedTitle}>Transactions</Text>
                          <Pressable 
                            onPress={() => {
                              setActiveBook(book);
                              router.push("/add-transaction");
                            }} 
                            style={styles.expandedAddBtn}
                          >
                            <Feather name="plus-circle" size={16} color="#FFFFFF" />
                            <Text style={styles.expandedAddBtnText}>Add</Text>
                          </Pressable>
                        </View>
                        
                        {bookTransactions.length === 0 ? (
                          <View style={styles.emptyTransactionsState}>
                            <Feather name="inbox" size={32} color="#D1D5DB" />
                            <Text style={styles.emptyTransactionsText}>No transactions yet</Text>
                            <Pressable 
                              onPress={() => {
                                setActiveBook(book);
                                router.push("/add-transaction");
                              }} 
                              style={styles.emptyAddBtn}
                            >
                              <Text style={styles.emptyAddBtnText}>Add your first transaction</Text>
                            </Pressable>
                          </View>
                        ) : (
                          bookTransactions.slice(0, 5).map((tx) => (
                            <View key={tx.id} style={styles.expandedTxItem}>
                              <View style={[styles.expandedTxIcon, { backgroundColor: tx.type === 'income' ? '#10B98120' : '#EF444420' }]}>
                                <Feather name={tx.type === 'income' ? 'trending-up' : 'trending-down'} size={16} color={tx.type === 'income' ? '#10B981' : '#EF4444'} />
                              </View>
                              <View style={styles.expandedTxInfo}>
                                <Text style={styles.expandedTxCategory}>{tx.category}</Text>
                                <Text style={styles.expandedTxDate}>{formatDate(tx.createdAt)}</Text>
                              </View>
                              <Text style={[styles.expandedTxAmount, { color: tx.type === 'income' ? '#10B981' : '#EF4444' }]}>
                                {tx.type === 'income' ? '+' : '-'} {getCurrencyCode()} {tx.amount.toLocaleString('en-EG')}
                              </Text>
                            </View>
                          ))
                        )}
                        
                        {bookTransactions.length > 5 && (
                          <Pressable 
                            onPress={() => {
                              setActiveBook(book);
                              handleOpenBook(book);
                            }} 
                            style={styles.viewAllBtn}
                          >
                            <Text style={styles.viewAllBtnText}>View all {bookTransactions.length} transactions</Text>
                            <Feather name="arrow-right" size={14} color="#3B82F6" />
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyBusinessState}>
          <Feather name="briefcase" size={48} color="#D1D5DB" />
          <Text style={styles.emptyBusinessTitle}>No Business Accounts Yet</Text>
          <Text style={styles.emptyBusinessText}>Create your first business account to get started</Text>
          // In the business view section of renderHomeContent, replace the empty state button:

<Pressable 
  onPress={() => {
    console.log("🔵 Creating ACCOUNT from home screen");
    // Set the type and category first
    setNewBookType("business");
    setNewBookCategory("assets");
    // Then show the modal
    setShowCreateBookModal(true);
  }} 
  style={styles.emptyBusinessBtn}
>
  <Text style={styles.emptyBusinessBtnText}>Create Account</Text>
</Pressable>
        </View>
      )}
    </View>
  );
};
  // Render Transactions Page (Personal)
  // Render Transactions Page (Personal)
const renderTransactionsContent = () => {
  {/* Filter Modal - Using top-level state */}
<Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
  <View style={styles.modalOverlay}>
    <View style={[styles.modalContent, { backgroundColor: '#FFFFFF', width: '90%', maxWidth: 400 }]}>
      <View style={styles.modalHeader}>
        <Text style={[styles.modalTitle, { color: '#111827', fontFamily: "Inter_700Bold" }]}>Filter Transactions</Text>
        <Pressable onPress={() => setShowFilterModal(false)} hitSlop={8}>
          <Feather name="x" size={24} color="#6B7280" />
        </Pressable>
      </View>
      
      <Text style={[styles.filterModalLabel, { fontFamily: "Inter_600SemiBold" }]}>Transaction Type</Text>
      <View style={styles.filterTypeRow}>
        <Pressable 
          onPress={() => setLocalFilterType("all")} 
          style={[styles.filterTypeChip, localFilterType === "all" && styles.filterTypeChipActive]}
        >
          <Text style={[styles.filterTypeText, localFilterType === "all" && styles.filterTypeTextActive]}>All</Text>
        </Pressable>
        <Pressable 
          onPress={() => setLocalFilterType("income")} 
          style={[styles.filterTypeChip, localFilterType === "income" && styles.filterTypeChipActiveIncome]}
        >
          <Text style={[styles.filterTypeText, localFilterType === "income" && styles.filterTypeTextActive]}>Income</Text>
        </Pressable>
        <Pressable 
          onPress={() => setLocalFilterType("expense")} 
          style={[styles.filterTypeChip, localFilterType === "expense" && styles.filterTypeChipActiveExpense]}
        >
          <Text style={[styles.filterTypeText, localFilterType === "expense" && styles.filterTypeTextActive]}>Expense</Text>
        </Pressable>
      </View>
      
      <Text style={[styles.filterModalLabel, { fontFamily: "Inter_600SemiBold" }]}>Sort Order</Text>
      <View style={styles.filterSortRow}>
        <Pressable 
          onPress={() => setLocalSortOrder("newest")} 
          style={[styles.filterSortChip, localSortOrder === "newest" && styles.filterSortChipActive]}
        >
          <Text style={[styles.filterSortText, localSortOrder === "newest" && styles.filterSortTextActive]}>Newest First</Text>
        </Pressable>
        <Pressable 
          onPress={() => setLocalSortOrder("oldest")} 
          style={[styles.filterSortChip, localSortOrder === "oldest" && styles.filterSortChipActive]}
        >
          <Text style={[styles.filterSortText, localSortOrder === "oldest" && styles.filterSortTextActive]}>Oldest First</Text>
        </Pressable>
      </View>
      
      <View style={styles.filterModalActions}>
        <Pressable 
          onPress={() => setShowFilterModal(false)} 
          style={[styles.filterModalBtn, { backgroundColor: '#F3F4F6' }]}
        >
          <Text style={[styles.filterModalBtnText, { color: '#6B7280' }]}>Cancel</Text>
        </Pressable>
        <Pressable 
          onPress={() => {
            console.log("🔵 Applying filters:", { localFilterType, localSortOrder });
            setFilterType(localFilterType);
            setSortOrder(localSortOrder);
            setShowFilterModal(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }} 
          style={[styles.filterModalBtn, { backgroundColor: '#3B82F6' }]}
        >
          <Text style={[styles.filterModalBtnText, { color: '#FFFFFF' }]}>Apply Filters</Text>
        </Pressable>
      </View>
    </View>
  </View>
</Modal>
  return (
    <View style={styles.transactionsSection}>
      {/* Header */}
      <View style={styles.businessHeader}>
        <Text style={styles.businessTitle}>Transactions</Text>
        <Pressable onPress={handleAddPersonalTransaction} style={styles.businessAddTransBtn}>
          <Feather name="plus-circle" size={16} color="#FFFFFF" />
          <Text style={styles.businessAddTransText}>Add Transaction</Text>
        </Pressable>
      </View>
      
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Feather name="x" size={18} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
        <Pressable 
          onPress={() => {
            console.log("🔵 Filter button pressed!");
            setLocalFilterType(filterType);
            setLocalSortOrder(sortOrder);
            setShowFilterModal(true);
          }} 
          style={styles.filterIconBtn}
        >
          <Feather name="sliders" size={20} color="#3B82F6" />
        </Pressable>
      </View>
      
      {/* Filter Row */}
      <View style={styles.filterRowContainer}>
        <View style={styles.typeFilterGroup}>
          <Pressable 
            onPress={() => setFilterType("all")} 
            style={[styles.typeFilterChip, filterType === "all" && styles.typeFilterChipActive]}
          >
            <Text style={[styles.typeFilterText, filterType === "all" && styles.typeFilterTextActive]}>All</Text>
          </Pressable>
          <Pressable 
            onPress={() => setFilterType("income")} 
            style={[styles.typeFilterChip, filterType === "income" && styles.typeFilterChipActiveIncome]}
          >
            <Text style={[styles.typeFilterText, filterType === "income" && styles.typeFilterTextActive]}>Income</Text>
          </Pressable>
          <Pressable 
            onPress={() => setFilterType("expense")} 
            style={[styles.typeFilterChip, filterType === "expense" && styles.typeFilterChipActiveExpense]}
          >
            <Text style={[styles.typeFilterText, filterType === "expense" && styles.typeFilterTextActive]}>Expense</Text>
          </Pressable>
        </View>
        
        <View style={styles.dateSortGroup}>
          <Text style={styles.dateSortLabel}>Sort by:</Text>
          <Pressable onPress={() => setSortOrder("newest")} style={styles.dateSortOption}>
            <Text style={[styles.dateSortText, sortOrder === "newest" && styles.dateSortTextActive]}>Newest</Text>
            {sortOrder === "newest" && <Feather name="check" size={12} color="#3B82F6" />}
          </Pressable>
          <View style={styles.dateDivider} />
          <Pressable onPress={() => setSortOrder("oldest")} style={styles.dateSortOption}>
            <Text style={[styles.dateSortText, sortOrder === "oldest" && styles.dateSortTextActive]}>Oldest</Text>
            {sortOrder === "oldest" && <Feather name="check" size={12} color="#3B82F6" />}
          </Pressable>
        </View>
      </View>
      
      {/* Stats Card */}
      <View style={styles.statsCard}>
        <View style={styles.statsCardLeft}>
          <Text style={styles.statsCardLabel}>Total Income</Text>
          <Text style={styles.statsCardAmount}>{getCurrencyCode()} {calculateStats.totalIncome.toLocaleString('en-EG')}</Text>
          <View style={styles.statsCardTrend}>
            <Feather name={calculateStats.isIncomeUp ? "arrow-up" : "arrow-down"} size={14} color={calculateStats.isIncomeUp ? '#10B981' : '#EF4444'} />
            <Text style={[styles.statsCardPercent, { color: calculateStats.isIncomeUp ? '#10B981' : '#EF4444' }]}>
              {Math.abs(calculateStats.incomeChange).toFixed(1)}%
            </Text>
            <Text style={styles.statsCardVs}>vs last month</Text>
          </View>
        </View>
        <View style={styles.statsDivider} />
        <View style={styles.statsCardRight}>
          <Text style={styles.statsCardLabel}>Total Expense</Text>
          <Text style={styles.statsCardAmount}>{getCurrencyCode()} {calculateStats.totalExpense.toLocaleString('en-EG')}</Text>
          <View style={styles.statsCardTrend}>
            <Feather name={calculateStats.isExpenseUp ? "arrow-up" : "arrow-down"} size={14} color={calculateStats.isExpenseUp ? '#EF4444' : '#10B981'} />
            <Text style={[styles.statsCardPercent, { color: calculateStats.isExpenseUp ? '#EF4444' : '#10B981' }]}>
              {Math.abs(calculateStats.expenseChange).toFixed(1)}%
            </Text>
            <Text style={styles.statsCardVs}>vs last month</Text>
          </View>
        </View>
      </View>
      
      {/* Transactions List */}
      {filteredTransactions.length === 0 ? (
        <View style={styles.noTransactionsCard}>
          <Feather name="credit-card" size={32} color="#9CA3AF" />
          <Text style={styles.noTransactionsText}>No transactions found</Text>
          <Text style={styles.noTransactionsSubtext}>
            {searchQuery ? "Try a different search term" : "Tap the + button to add your first transaction"}
          </Text>
        </View>
      ) : (
        <View style={styles.transactionsList}>
          {filteredTransactions.map((tx) => (
            <View key={tx.id} style={styles.recentTxItem}>
              <View style={[styles.recentTxIcon, { backgroundColor: tx.type === 'income' ? '#10B98120' : '#EF444420' }]}>
                <Feather name={tx.type === 'income' ? 'trending-up' : 'trending-down'} size={18} color={tx.type === 'income' ? '#10B981' : '#EF4444'} />
              </View>
              <View style={styles.recentTxInfo}>
                <Text style={styles.recentTxCategory}>{tx.category}</Text>
                {tx.note ? <Text style={styles.recentTxNote} numberOfLines={1}>{tx.note}</Text> : null}
                <Text style={styles.recentTxDate}>{formatDate(tx.createdAt)}</Text>
              </View>
              <Text style={[styles.recentTxAmount, { color: tx.type === 'income' ? '#10B981' : '#EF4444' }]}>
                {tx.type === 'income' ? '+' : '-'} {getCurrencyCode()} {tx.amount.toLocaleString('en-EG')}
              </Text>
            </View>
          ))}
        </View>
      )}
      
      {/* Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFFFFF', width: '90%', maxWidth: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#111827', fontFamily: "Inter_700Bold" }]}>Filter Transactions</Text>
              <Pressable onPress={() => setLocalShowFilter(false)} hitSlop={8}>
                <Feather name="x" size={24} color="#6B7280" />
              </Pressable>
            </View>
            
            <Text style={[styles.filterModalLabel, { fontFamily: "Inter_600SemiBold" }]}>Transaction Type</Text>
            <View style={styles.filterTypeRow}>
              <Pressable 
                onPress={() => setLocalFilterType("all")} 
                style={[styles.filterTypeChip, localFilterType === "all" && styles.filterTypeChipActive]}
              >
                <Text style={[styles.filterTypeText, localFilterType === "all" && styles.filterTypeTextActive]}>All</Text>
              </Pressable>
              <Pressable 
                onPress={() => setLocalFilterType("income")} 
                style={[styles.filterTypeChip, localFilterType === "income" && styles.filterTypeChipActiveIncome]}
              >
                <Text style={[styles.filterTypeText, localFilterType === "income" && styles.filterTypeTextActive]}>Income</Text>
              </Pressable>
              <Pressable 
                onPress={() => setLocalFilterType("expense")} 
                style={[styles.filterTypeChip, localFilterType === "expense" && styles.filterTypeChipActiveExpense]}
              >
                <Text style={[styles.filterTypeText, localFilterType === "expense" && styles.filterTypeTextActive]}>Expense</Text>
              </Pressable>
            </View>
            
            <Text style={[styles.filterModalLabel, { fontFamily: "Inter_600SemiBold" }]}>Sort Order</Text>
            <View style={styles.filterSortRow}>
              <Pressable 
                onPress={() => setLocalSortOrder("newest")} 
                style={[styles.filterSortChip, localSortOrder === "newest" && styles.filterSortChipActive]}
              >
                <Text style={[styles.filterSortText, localSortOrder === "newest" && styles.filterSortTextActive]}>Newest First</Text>
              </Pressable>
              <Pressable 
                onPress={() => setLocalSortOrder("oldest")} 
                style={[styles.filterSortChip, localSortOrder === "oldest" && styles.filterSortChipActive]}
              >
                <Text style={[styles.filterSortText, localSortOrder === "oldest" && styles.filterSortTextActive]}>Oldest First</Text>
              </Pressable>
            </View>
            
            <View style={styles.filterModalActions}>
              <Pressable 
                onPress={() => setLocalShowFilter(false)} 
                style={[styles.filterModalBtn, { backgroundColor: '#F3F4F6' }]}
              >
                <Text style={[styles.filterModalBtnText, { color: '#6B7280' }]}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={() => {
                  console.log("🔵 Applying filters:", { localFilterType, localSortOrder });
                  setFilterType(localFilterType);
                  setSortOrder(localSortOrder);
                  setShowFilterModal(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }} 
                style={[styles.filterModalBtn, { backgroundColor: '#3B82F6' }]}
              >
                <Text style={[styles.filterModalBtnText, { color: '#FFFFFF' }]}>Apply Filters</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
// Helper functions for budget categories - Add this after BUDGET_CATEGORIES
const getCategoryIcon = (category: string): string => {
  const iconMap: Record<string, string> = {
    'Food & Dining': 'shopping-bag',
    'Transportation': 'truck',
    'Entertainment': 'film',
    'Shopping': 'shopping-cart',
    'Bills & Utilities': 'home',
    'Health & Fitness': 'heart',
    'Education': 'book',
    'Travel': 'map',
    'Inventory': 'package',
    'Salaries': 'users',
    'Rent': 'home',
    'Utilities': 'zap',
    'Marketing': 'trending-up',
    'Maintenance': 'tool',
    'Taxes': 'file-text',
    'Supplies': 'clipboard',
    'Equipment': 'hard-drive',
    'Other Expense': 'more-horizontal',
    'Groceries': 'shopping-bag',
    'Dining': 'coffee',
    'Healthcare': 'heart',
    'Insurance': 'shield',
    'Investment': 'trending-up',
    'Stocks': 'bar-chart-2',
    'Bonds': 'file-text',
    'Real Estate': 'home',
    'Property': 'home',
    'Crypto': 'bitcoin',
    'Gold': 'dollar-sign',
    'Silver': 'dollar-sign',
    'Fixed Deposit': 'archive',
    'Brokerage': 'briefcase',
    'Trading Fee': 'percent',
    'Property Maintenance': 'tool',
    'Loan Payment': 'credit-card',
    'Credit Card Payment': 'credit-card',
    'Mortgage Payment': 'home',
    'Student Loan Payment': 'book-open',
    'Personal Loan Payment': 'user',
    'Car Loan Payment': 'truck',
    'EMI Payment': 'calendar',
    'Debt Repayment': 'alert-circle',
  };
  return iconMap[category] || 'circle';
};

const getCategoryColor = (category: string): string => {
  const colorMap: Record<string, string> = {
    'Food & Dining': '#3B82F6',
    'Transportation': '#10B981',
    'Entertainment': '#8B5CF6',
    'Shopping': '#F59E0B',
    'Bills & Utilities': '#EC4899',
    'Health & Fitness': '#EF4444',
    'Education': '#6366F1',
    'Travel': '#14B8A6',
    'Inventory': '#3B82F6',
    'Salaries': '#10B981',
    'Rent': '#EC4899',
    'Utilities': '#F59E0B',
    'Marketing': '#8B5CF6',
    'Maintenance': '#EF4444',
    'Taxes': '#6366F1',
    'Supplies': '#14B8A6',
    'Equipment': '#3B82F6',
    'Other Expense': '#6B7280',
    'Groceries': '#3B82F6',
    'Dining': '#F59E0B',
    'Healthcare': '#EF4444',
    'Insurance': '#10B981',
    'Investment': '#8B5CF6',
    'Stocks': '#10B981',
    'Bonds': '#3B82F6',
    'Real Estate': '#F59E0B',
    'Property': '#F59E0B',
    'Crypto': '#8B5CF6',
    'Gold': '#F59E0B',
    'Silver': '#9CA3AF',
    'Fixed Deposit': '#14B8A6',
    'Brokerage': '#EC4899',
    'Trading Fee': '#EF4444',
    'Property Maintenance': '#F59E0B',
    'Loan Payment': '#EF4444',
    'Credit Card Payment': '#EF4444',
    'Mortgage Payment': '#EF4444',
    'Student Loan Payment': '#EF4444',
    'Personal Loan Payment': '#EF4444',
    'Car Loan Payment': '#EF4444',
    'EMI Payment': '#EF4444',
    'Debt Repayment': '#EF4444',
  };
  return colorMap[category] || '#6B7280';
};

// Replace the budget categories with expense categories from add-transaction
// Remove the old BUDGET_CATEGORIES and use EXPENSE_CATEGORIES instead
  // Render Budgets Page
  // Render Budgets Page
// Render Budgets Page
// Render Budgets Page - WITH CATEGORIES FROM ADD-TRANSACTION
// Render Budgets Page
const renderBudgetsContent = () => {
  const currencyCode = getCurrencyCode();
  
  // Use EXPENSE_CATEGORIES from add-transaction
  // If EXPENSE_CATEGORIES is not available, use BUDGET_CATEGORIES as fallback
  let budgetCategories: { name: string; icon: string; color: string }[] = [];
  
  try {
    if (typeof EXPENSE_CATEGORIES !== 'undefined' && EXPENSE_CATEGORIES.length > 0) {
      budgetCategories = EXPENSE_CATEGORIES.map(cat => ({
        name: cat,
        icon: getCategoryIcon(cat),
        color: getCategoryColor(cat),
      }));
    } else {
      // Fallback to BUDGET_CATEGORIES
      budgetCategories = BUDGET_CATEGORIES.map(cat => ({
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
      }));
    }
  } catch (e) {
    // Ultimate fallback
    budgetCategories = BUDGET_CATEGORIES.map(cat => ({
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
    }));
  }
  
  // Calculate spent amounts from personalTransactions for each budget category
  const budgetsWithSpent = budgets.map(budget => {
    let spent = 0;
    personalTransactions.forEach(transaction => {
      if (transaction.type === 'expense') {
        const category = transaction.category?.toLowerCase() || "";
        const budgetCategory = budget.category.toLowerCase();
        
        // Match transaction category with budget category
        if (category === budgetCategory || 
            category.includes(budgetCategory) || 
            budgetCategory.includes(category)) {
          spent += transaction.amount;
        }
      }
    });
    return { ...budget, spent };
  });
  
  const totalBudget = budgetsWithSpent.reduce((sum, b) => sum + b.budget, 0);
  const totalSpent = budgetsWithSpent.reduce((sum, b) => sum + b.spent, 0);
  const spentPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  
  // Get only budgets that have a budget amount set or have spending
  const activeBudgets = budgetsWithSpent.filter(b => b.budget > 0 || b.spent > 0);
  
  return (
    <View style={styles.budgetsSection}>
      {/* Header */}
      <View style={styles.businessHeader}>
        <Text style={styles.businessTitle}>Budgets</Text>
        <Pressable onPress={() => setShowAddBudgetModal(true)} style={styles.businessAddTransBtn}>
          <Feather name="plus-circle" size={16} color="#FFFFFF" />
          <Text style={styles.businessAddTransText}>Set Budget</Text>
        </Pressable>
      </View>
      
      {/* Stats Card with Ring Chart */}
      <View style={styles.budgetStatsCard}>
        <View style={styles.budgetStatsLeft}>
          <Text style={styles.budgetStatsLabel}>Total Budget</Text>
          <Text style={styles.budgetStatsAmount}>{currencyCode} {totalBudget.toLocaleString()}</Text>
          <View style={styles.budgetStatsDivider} />
          <Text style={styles.budgetStatsSubLabel}>Total Spent</Text>
          <Text style={styles.budgetStatsSubAmount}>{currencyCode} {totalSpent.toLocaleString()}</Text>
          <View style={styles.budgetStatsDivider} />
          <Text style={styles.budgetStatsSubLabel}>Remaining</Text>
          <Text style={[styles.budgetStatsSubAmount, { color: '#22C55E' }]}>
            {currencyCode} {(totalBudget - totalSpent).toLocaleString()}
          </Text>
        </View>
        
        <View style={styles.budgetRingChart}>
  <Svg width={100} height={100} viewBox="0 0 100 100">
    {/* Background circle */}
    <Circle cx="50" cy="50" r="42" stroke="#E5E7EB" strokeWidth="8" fill="none" />
    {/* Progress circle - GREEN */}
    <Circle
      cx="50"
      cy="50"
      r="42"
      stroke="#22C55E"
      strokeWidth="8"
      fill="none"
      strokeDasharray={`${2 * Math.PI * 42}`}
      strokeDashoffset={`${2 * Math.PI * 42 * (1 - spentPercentage / 100)}`}
      strokeLinecap="round"
      transform="rotate(-90 50 50)"
    />
  </Svg>
  <View style={styles.ringChartCenter}>
    <Text style={styles.ringChartPercent}>{Math.round(spentPercentage)}%</Text>
    <Text style={styles.ringChartLabel}>Spent</Text>
  </View>
</View>
      </View>
      
      {/* Budget Overview */}
      <View style={styles.budgetOverviewCard}>
        <View style={styles.budgetOverviewHeader}>
          <Text style={styles.budgetOverviewTitle}>Budget Overview</Text>
        </View>
        
        {activeBudgets.length === 0 ? (
          <View style={styles.emptyBudgetsState}>
            <Feather name="target" size={32} color="#D1D5DB" />
            <Text style={styles.emptyBudgetsText}>No budgets set yet</Text>
            <Text style={styles.emptyBudgetsSubtext}>Tap the button above to set your first budget</Text>
          </View>
        ) : (
          activeBudgets.map((budget) => {
            const spentPercent = budget.budget > 0 ? (budget.spent / budget.budget) * 100 : 0;
            const isOverBudget = spentPercent > 100;
            
            return (
              <View key={budget.id} style={styles.budgetItem}>
                <View style={styles.budgetItemHeader}>
                  <View style={styles.budgetItemLeft}>
                    <View style={[styles.budgetItemIcon, { backgroundColor: budget.color + '15' }]}>
                      <Feather name={budget.icon as any} size={16} color={budget.color} />
                    </View>
                    <View>
                      <Text style={styles.budgetItemName}>{budget.category}</Text>
                      <Text style={styles.budgetItemSpent}>
                        {currencyCode}{budget.spent.toLocaleString()} / {currencyCode}{budget.budget.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.budgetItemPercent, { color: isOverBudget ? '#EF4444' : '#10B981' }]}>
                    {Math.round(spentPercent)}%
                  </Text>
                </View>
                <View style={styles.budgetProgressBar}>
                  <View style={[styles.budgetProgressFill, { width: `${Math.min(spentPercent, 100)}%`, backgroundColor: isOverBudget ? '#EF4444' : budget.color }]} />
                </View>
              </View>
            );
          })
        )}
      </View>
      
      {/* Add Budget Modal */}
      <Modal visible={showAddBudgetModal} transparent animationType="slide" onRequestClose={() => setShowAddBudgetModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFFFFF', width: '90%', maxWidth: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#111827', fontFamily: "Inter_700Bold" }]}>Set Budget</Text>
              <Pressable onPress={() => setShowAddBudgetModal(false)} hitSlop={8}>
                <Feather name="x" size={24} color="#6B7280" />
              </Pressable>
            </View>
            
            <Text style={[styles.budgetModalLabel, { fontFamily: "Inter_600SemiBold" }]}>Select Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.budgetCategoryScroll}>
              {budgetCategories.map((cat) => (
                <Pressable
                  key={cat.name}
                  onPress={() => setSelectedBudgetCategory(cat.name)}
                  style={[styles.budgetCategoryOption, selectedBudgetCategory === cat.name && styles.budgetCategoryOptionActive]}
                >
                  <View style={[styles.budgetCategoryIcon, { backgroundColor: cat.color + '15' }]}>
                    <Feather name={cat.icon as any} size={14} color={cat.color} />
                  </View>
                  <Text style={[styles.budgetCategoryText, selectedBudgetCategory === cat.name && styles.budgetCategoryTextActive]}>
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            
            <Text style={[styles.budgetModalLabel, { fontFamily: "Inter_600SemiBold" }]}>Budget Amount ({currencyCode})</Text>
            <TextInput
              style={styles.budgetAmountInput}
              placeholder="Enter amount"
              placeholderTextColor="#9CA3AF"
              value={budgetAmount}
              onChangeText={setBudgetAmount}
              keyboardType="numeric"
            />
            
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowAddBudgetModal(false)} style={[styles.modalBtn, { backgroundColor: '#F3F4F6' }]}>
                <Text style={[styles.modalBtnText, { color: '#6B7280', fontFamily: "Inter_500Medium" }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveBudget} style={[styles.modalBtn, { backgroundColor: '#3B82F6' }]}>
                <Text style={[styles.modalBtnText, { color: '#FFF', fontFamily: "Inter_600SemiBold" }]}>Save Budget</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
// Render Goals Page
// Render Goals Page - WITH SAVINGS TRACKING
const renderGoalsContent = () => {
  const currencyCode = getCurrencyCode();
  
  // Use goals directly from state (savedAmount is already updated)
  const filteredGoals = goals.filter(g => g.status === selectedGoalTab);
  const totalGoals = goals.length;
  const totalActiveGoals = goals.filter(g => g.status === "active").length;
  const totalCompletedGoals = goals.filter(g => g.status === "completed").length;
  const totalSaved = goals.reduce((sum, g) => sum + g.savedAmount, 0);
  
  const goalIcons = [
    { id: "target", name: "Target", icon: "target" },
    { id: "shield", name: "Emergency", icon: "shield" },
    { id: "truck", name: "Car", icon: "truck" },
    { id: "map", name: "Travel", icon: "map" },
    { id: "home", name: "House", icon: "home" },
    { id: "book", name: "Education", icon: "book" },
    { id: "heart", name: "Health", icon: "heart" },
    { id: "briefcase", name: "Business", icon: "briefcase" },
  ];
  
  return (
    <View style={styles.goalsSection}>
      <View style={styles.businessHeader}>
        <Text style={styles.businessTitle}>Goals</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <View style={styles.goalsStatsRow}>
        <View style={[styles.goalStatCard, styles.goalStatCardLeft]}>
          <Feather name="target" size={20} color="#FFFFFF" style={styles.goalStatIcon} />
          <Text style={styles.goalStatLabel}>Total Goals</Text>
          <Text style={styles.goalStatAmount}>{totalGoals}</Text>
        </View>
        <View style={[styles.goalStatCard, styles.goalStatCardRight]}>
          <Feather name="credit-card" size={20} color="#FFFFFF" style={styles.goalStatIcon} />
          <Text style={styles.goalStatLabel}>Total Saved</Text>
          <Text style={styles.goalStatAmount}>{currencyCode}{totalSaved.toLocaleString()}</Text>
        </View>
      </View>
      
      <View style={styles.goalTabsContainer}>
        <Pressable onPress={() => setSelectedGoalTab("active")} style={[styles.goalTab, selectedGoalTab === "active" && styles.goalTabActive]}>
          <Text style={[styles.goalTabText, selectedGoalTab === "active" && styles.goalTabTextActive]}>Active ({totalActiveGoals})</Text>
        </Pressable>
        <Pressable onPress={() => setSelectedGoalTab("completed")} style={[styles.goalTab, selectedGoalTab === "completed" && styles.goalTabActive]}>
          <Text style={[styles.goalTabText, selectedGoalTab === "completed" && styles.goalTabTextActive]}>Completed ({totalCompletedGoals})</Text>
        </Pressable>
      </View>
      
      {filteredGoals.length === 0 ? (
        <View style={styles.emptyBusinessState}>
          <Feather name="target" size={48} color="#D1D5DB" />
          <Text style={styles.emptyBusinessTitle}>{selectedGoalTab === "active" ? "No Active Goals" : "No Completed Goals"}</Text>
          <Text style={styles.emptyBusinessText}>Tap the + button to create your first financial goal</Text>
        </View>
      ) : (
        <View style={styles.goalsList}>
          {filteredGoals.map((goal) => {
            const progress = (goal.savedAmount / goal.targetAmount) * 100;
            const isCompleted = progress >= 100;
            
            return (
              <Pressable key={goal.id} onLongPress={() => deleteGoal(goal.id)} style={styles.goalCard}>
                <View style={styles.goalCardHeader}>
                  <View style={[styles.goalCardIcon, { backgroundColor: goal.color + '15' }]}>
                    <Feather name={goal.icon as any} size={20} color={goal.color} />
                  </View>
                  <View style={styles.goalCardInfo}>
                    <Text style={styles.goalCardName}>{goal.name}</Text>
                    <Text style={styles.goalCardAmount}>
                      {currencyCode}{goal.savedAmount.toLocaleString()} / {currencyCode}{goal.targetAmount.toLocaleString()}
                    </Text>
                    {goal.deadline && (
                      <Text style={styles.goalCardDeadline}><Feather name="calendar" size={8} color="#9CA3AF" /> {goal.deadline}</Text>
                    )}
                  </View>
                  <View style={[styles.goalProgressChip, { backgroundColor: isCompleted ? '#10B98115' : goal.color + '15' }]}>
                    <Text style={[styles.goalProgressText, { color: isCompleted ? '#10B981' : goal.color }]}>{Math.round(progress)}%</Text>
                  </View>
                </View>
                <View style={styles.goalProgressBar}>
                  <View style={[styles.goalProgressFill, { width: `${Math.min(progress, 100)}%`, backgroundColor: goal.color }]} />
                </View>
                {isCompleted && (
                  <View style={styles.goalCompletedBadge}>
                    <Feather name="check-circle" size={14} color="#10B981" />
                    <Text style={styles.goalCompletedText}>Completed!</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
      
      <Pressable onPress={() => setShowAddGoalModal(true)} style={styles.goalFabButton}>
        <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.goalFabGradient}>
          <Feather name="plus" size={24} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
      
      {/* Add Goal Modal */}
      <Modal visible={showAddGoalModal} transparent animationType="slide" onRequestClose={() => setShowAddGoalModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFFFFF', width: '90%', maxWidth: 400, maxHeight: '85%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: '#111827', fontFamily: "Inter_700Bold" }]}>
                  {editingGoalId ? "Edit Goal" : "Add New Goal"}
                </Text>
                <Pressable onPress={() => {
                  setShowAddGoalModal(false);
                  setEditingGoalId(null);
                  setNewGoalName("");
                  setNewGoalTarget("");
                  setNewGoalIcon("target");
                  setNewGoalDeadline("");
                }} hitSlop={8}>
                  <Feather name="x" size={24} color="#6B7280" />
                </Pressable>
              </View>
              
              <Text style={styles.goalModalLabel}>Goal Name</Text>
              <TextInput 
                style={styles.goalModalInput} 
                placeholder="e.g., Emergency Fund" 
                placeholderTextColor="#9CA3AF" 
                value={newGoalName} 
                onChangeText={setNewGoalName} 
              />
              
              <Text style={styles.goalModalLabel}>Target Amount ({currencyCode})</Text>
              <TextInput 
                style={styles.goalModalInput} 
                placeholder="Enter target amount" 
                placeholderTextColor="#9CA3AF" 
                value={newGoalTarget} 
                onChangeText={setNewGoalTarget} 
                keyboardType="numeric" 
              />
              
              <Text style={styles.goalModalLabel}>Select Icon</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.goalIconScroll}>
                {goalIcons.map((icon) => (
                  <Pressable 
                    key={icon.id} 
                    onPress={() => setNewGoalIcon(icon.icon)} 
                    style={[styles.goalIconOption, newGoalIcon === icon.icon && styles.goalIconOptionActive]}
                  >
                    <Feather name={icon.icon as any} size={20} color={newGoalIcon === icon.icon ? '#3B82F6' : '#9CA3AF'} />
                    <Text style={[styles.goalIconText, newGoalIcon === icon.icon && styles.goalIconTextActive]}>{icon.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              
              <Text style={styles.goalModalLabel}>Deadline (Optional)</Text>
              <TextInput 
                style={styles.goalModalInput} 
                placeholder="YYYY-MM-DD" 
                placeholderTextColor="#9CA3AF" 
                value={newGoalDeadline} 
                onChangeText={setNewGoalDeadline} 
              />
              
              <View style={styles.modalActions}>
                <Pressable onPress={() => {
                  setShowAddGoalModal(false);
                  setEditingGoalId(null);
                  setNewGoalName("");
                  setNewGoalTarget("");
                  setNewGoalIcon("target");
                  setNewGoalDeadline("");
                }} style={[styles.modalBtn, { backgroundColor: '#F3F4F6' }]}>
                  <Text style={[styles.modalBtnText, { color: '#6B7280', fontFamily: "Inter_500Medium" }]}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveGoal} style={[styles.modalBtn, { backgroundColor: '#3B82F6' }]}>
                  <Text style={[styles.modalBtnText, { color: '#FFF', fontFamily: "Inter_600SemiBold" }]}>
                    {editingGoalId ? "Update Goal" : "Create Goal"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};
// Render Docs Page (Business)
const renderDocsContent = () => {
  const FILTERS: FilterType[] = ["All", "Invoice", "Quote", "Credit Note", "Purchase Order"];
  
  const DOCUMENT_CONFIG: Record<string, { icon: string; color: string }> = {
    Invoice: { icon: "file-text", color: "#3B82F6" },
    Quote: { icon: "file", color: "#10B981" },
    "Credit Note": { icon: "credit-card", color: "#8B5CF6" },
    "Purchase Order": { icon: "package", color: "#EC4899" },
  };
  
  // Get counts for each type
  const getCountForType = (type: FilterType) => {
    if (type === "All") return documentsList.length;
    return documentsList.filter(doc => doc.type === type).length;
  };
  
  // Filtered documents based on selected filter
  const filteredDocs = documentsFilter === "All" 
    ? documentsList 
    : documentsList.filter(doc => doc.type === documentsFilter);
  
  // Handle document type selection - navigates to create-document screen
  const handleSelectType = (type: string) => {
  setShowCreateDocumentModal(false);
  // Navigate to create document screen with type
  router.push({
    pathname: "/create-document",
    params: { type: type.toLowerCase().replace(/\s/g, "-") }
  });
};
  
  // Handle AI generation - navigates to AI document chat
  const handleAIGenerate = () => {
    setShowCreateDocumentModal(false);
    router.push("/ai-document-chat");
  };
  
  // Document Icon Component
  const DocumentIcon = ({ type, size = 40 }: { type: string; size?: number }) => {
    const config = DOCUMENT_CONFIG[type] || DOCUMENT_CONFIG.Invoice;
    return (
      <View style={[styles.docIconCircle, { backgroundColor: config.color + "15", width: size, height: size, borderRadius: size / 2 }]}>
        <Feather name={config.icon as any} size={size * 0.5} color={config.color} />
      </View>
    );
  };
  
  // Document Type Badge
  const DocumentTypeBadge = ({ type }: { type: string }) => {
    const config = DOCUMENT_CONFIG[type] || DOCUMENT_CONFIG.Invoice;
    return (
      <View style={[styles.typeBadge, { backgroundColor: config.color + "15" }]}>
        <Text style={[styles.typeBadgeText, { color: config.color }]}>{type}</Text>
      </View>
    );
  };
  
  // Stat Card Component
  const StatCard = ({ type, count, onPress }: { type: FilterType; count: number; onPress: () => void }) => {
    let iconName = "grid";
    let iconColor = "#6B7280";
    if (type !== "All") {
      const config = DOCUMENT_CONFIG[type];
      iconName = config.icon;
      iconColor = config.color;
    }
    return (
      <Pressable onPress={onPress} style={styles.docStatCard}>
        <View style={[styles.docStatIconCircle, { backgroundColor: iconColor + "15" }]}>
          <Feather name={iconName as any} size={20} color={iconColor} />
        </View>
        <Text style={styles.docStatType}>{type}</Text>
        <Text style={[styles.docStatCount, { color: iconColor }]}>{count}</Text>
      </Pressable>
    );
  };
  
  // Document Card Component
  const DocumentCard = ({ document, onPress, onDownload }: { document: Document; onPress: () => void; onDownload: () => void }) => {
  const book = books.find(b => b.id === document.bookId);
  return (
    <Pressable onPress={onPress} style={styles.docCard}>
      <DocumentIcon type={document.type} size={44} />
      <View style={styles.docCardContent}>
        <Text style={styles.docCardNumber} numberOfLines={1}>{document.number}</Text>
        <Text style={styles.docCardParty} numberOfLines={1}>{document.partyName}</Text>
        {book && (
          <Text style={styles.docCardBook} numberOfLines={1}>📁 {book.name}</Text>
        )}
      </View>
      <View style={styles.docCardBadgeContainer}>
        <DocumentTypeBadge type={document.type} />
        <Pressable onPress={onDownload} style={styles.docDownloadBtn}>
          <Feather name="download" size={16} color="#3B82F6" />
        </Pressable>
      </View>
    </Pressable>
  );
};
  
  return (
    <>

      {/* Documents Hub Title Section */}
      <View style={styles.docsTitleSection}>
        <View>
          <Text style={styles.docsHubTitle}>Documents Hub</Text>
          <Text style={styles.docsHubSubtitle}>{documentsList.length} docs • AI-assisted creation</Text>
        </View>
        <Pressable onPress={() => setShowCreateDocumentModal(true)} style={styles.createDocBtn}>
          <Feather name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.createDocBtnText}>Create Document</Text>
        </Pressable>
      </View>
      
      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.docsFilterScroll}>
        {FILTERS.map((filter) => (
          <Pressable
            key={filter}
            onPress={() => setDocumentsFilter(filter)}
            style={[styles.docsFilterChip, documentsFilter === filter && styles.docsFilterChipActive]}
          >
            <Text style={[styles.docsFilterChipText, documentsFilter === filter && styles.docsFilterChipTextActive]}>
              {filter} {filter !== "All" && `(${getCountForType(filter)})`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      
      {/* Stats Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.docsStatsScroll}>
        <StatCard type="All" count={getCountForType("All")} onPress={() => setDocumentsFilter("All")} />
        {Object.keys(DOCUMENT_CONFIG).map((type) => (
          <StatCard key={type} type={type as FilterType} count={getCountForType(type as FilterType)} onPress={() => setDocumentsFilter(type as FilterType)} />
        ))}
      </ScrollView>
      
      {/* Documents List */}
      {filteredDocs.length === 0 ? (
        <View style={styles.docsEmptyState}>
          <Feather name="file-text" size={48} color="#D1D5DB" />
          <Text style={styles.docsEmptyTitle}>No document yet</Text>
          <Text style={styles.docsEmptyText}>Generate your first one with AI or start from a blank template</Text>
          <Pressable onPress={() => setShowCreateDocumentModal(true)} style={styles.docsEmptyBtn}>
            <Text style={styles.docsEmptyBtnText}>Create Document</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.docsList}>
          {filteredDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onPress={() => {
                setSelectedDocument(doc);
                setShowDocumentDetailModal(true);
              }}
              onDownload={() => generateDocumentPDF(doc)}
            />
          ))}
        </View>
      )}
      
      {/* Create Document Modal - EXACTLY LIKE INVOICES PAGE */}
      <Modal visible={showCreateDocumentModal} transparent animationType="slide" onRequestClose={() => setShowCreateDocumentModal(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContentFull, { backgroundColor: "#FFFFFF" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Document</Text>
              <Pressable onPress={() => setShowCreateDocumentModal(false)} hitSlop={8}>
                <Feather name="x" size={24} color="#000" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Generate with AI Option */}
              <Pressable onPress={handleAIGenerate} style={styles.aiGenerateOption}>
                <View style={styles.aiContent}>
                  <View>
                    <Text style={styles.aiTitle}>Generate with AI</Text>
                    <Text style={styles.aiSubtitle}>Create any document using text or voice</Text>
                  </View>
                  <View style={styles.aiRobotIcon}>
                    <Image 
                      source={{ uri: "https://i.ibb.co/N6YschDX/Gemini-Generated-Image-aua6dsaua6dsaua6.png" }}
                      style={styles.aiRobotImage}
                      resizeMode="contain"
                    />
                  </View>
                </View>
              </Pressable>

              {/* OR Divider */}
              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: "#E5E7EB" }]} />
                <Text style={[styles.dividerText, { color: "#9CA3AF" }]}>OR CHOOSE DOCUMENT TYPE</Text>
                <View style={[styles.dividerLine, { backgroundColor: "#E5E7EB" }]} />
              </View>

              {/* Document Type Options */}
              {Object.keys(DOCUMENT_CONFIG).map((type) => (
                <Pressable 
                  key={type} 
                  onPress={() => handleSelectType(type)} 
                  style={styles.typeOptionRow}
                >
                  <View style={[styles.typeOptionIconRow, { backgroundColor: DOCUMENT_CONFIG[type].color + "15" }]}>
                    <Feather name={DOCUMENT_CONFIG[type].icon as any} size={24} color={DOCUMENT_CONFIG[type].color} />
                  </View>
                  <Text style={styles.typeOptionTextRow}>{type}</Text>
                  <Feather name="chevron-right" size={20} color="#9CA3AF" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      
      {/* Document Detail Modal */}
      <Modal visible={showDocumentDetailModal} transparent animationType="slide" onRequestClose={() => setShowDocumentDetailModal(false)}>
        {selectedDocument && (
          <View style={styles.modalContainer}>
            <View style={[styles.modalContentFull, { backgroundColor: "#FFFFFF" }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowDocumentDetailModal(false)} hitSlop={8}>
                  <Feather name="arrow-left" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Document Details</Text>
                <View style={{ width: 40 }} />
              </View>
              
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={[styles.detailStatusBadge, { backgroundColor: (DOCUMENT_CONFIG[selectedDocument.type]?.color || "#3B82F6") + "15" }]}>
                  <View style={[styles.detailStatusDot, { backgroundColor: DOCUMENT_CONFIG[selectedDocument.type]?.color || "#3B82F6" }]} />
                  <Text style={[styles.detailStatusText, { color: DOCUMENT_CONFIG[selectedDocument.type]?.color || "#3B82F6" }]}>{selectedDocument.type}</Text>
                </View>
                
                <Text style={styles.detailNumber}>{selectedDocument.number}</Text>
                
                <View style={styles.detailRow}>
                  <Feather name="user" size={18} color="#6B7280" />
                  <Text style={styles.detailLabel}>Party Name</Text>
                  <Text style={styles.detailValue}>{selectedDocument.partyName}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Feather name="dollar-sign" size={18} color="#6B7280" />
                  <Text style={styles.detailLabel}>Amount</Text>
                  <Text style={[styles.detailAmount, { color: DOCUMENT_CONFIG[selectedDocument.type]?.color || "#3B82F6" }]}>
                    {getCurrencyCode()} {selectedDocument.amount.toLocaleString('en-EG')}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Feather name="calendar" size={18} color="#6B7280" />
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedDocument.date)}</Text>
                </View>
                
                {selectedDocument.dueDate && (
                  <View style={styles.detailRow}>
                    <Feather name="alert-circle" size={18} color="#6B7280" />
                    <Text style={styles.detailLabel}>Due Date</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedDocument.dueDate)}</Text>
                  </View>
                )}
                
                {selectedDocument.notes && (
                  <View style={styles.detailRow}>
                    <Feather name="file-text" size={18} color="#6B7280" />
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.detailValue}>{selectedDocument.notes}</Text>
                  </View>
                )}
                
                <Pressable onPress={() => generateDocumentPDF(selectedDocument)} style={styles.downloadPdfBtn}>
                  <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.downloadPdfGradient}>
                    <Feather name="download" size={20} color="#FFF" />
                    <Text style={styles.downloadPdfText}>Download PDF</Text>
                  </LinearGradient>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </>
  );
};

// Render Clients Page (Business) - NO HOOKS INSIDE
const renderClientsContent = () => {
  // Client Card Component
  const ClientCard = ({ client }: { client: Client }) => (
    <Pressable 
      onPress={() => {
        setSelectedClient(client);
        setShowClientDetailModal(true);
      }} 
      style={styles.clientCard}
    >
      <View style={[styles.clientCardIcon, { backgroundColor: client.status === 'active' ? '#10B98115' : '#EF444415' }]}>
        <Feather name="user" size={22} color={client.status === 'active' ? '#10B981' : '#EF4444'} />
      </View>
      <View style={styles.clientCardInfo}>
        <Text style={styles.clientCardName}>{client.name}</Text>
        {client.company ? <Text style={styles.clientCardCompany}>{client.company}</Text> : null}
        <View style={styles.clientCardChips}>
          <View style={[styles.clientStatusChip, { backgroundColor: client.status === 'active' ? '#10B98120' : '#EF444420' }]}>
            <View style={[styles.clientStatusDot, { backgroundColor: client.status === 'active' ? '#10B981' : '#EF4444' }]} />
            <Text style={[styles.clientStatusText, { color: client.status === 'active' ? '#10B981' : '#EF4444' }]}>
              {client.status === 'active' ? 'Active' : 'Inactive'}
            </Text>
          </View>
          {client.currency && (
            <View style={styles.clientCurrencyChip}>
              <Text style={styles.clientCurrencyText}>{client.currency}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.clientCardActions}>
        <Pressable onPress={() => editClient(client)} style={styles.clientActionBtn}>
          <Feather name="edit-2" size={16} color="#3B82F6" />
        </Pressable>
        <Pressable onPress={() => deleteClient(client)} style={styles.clientActionBtn}>
          <Feather name="trash-2" size={16} color="#EF4444" />
        </Pressable>
      </View>
    </Pressable>
  );
  
  return (
    <>
      {/* Clients Header */}
      <View style={styles.docsTitleSection}>
        <View>
          <Text style={styles.docsHubTitle}>Clients</Text>
          <Text style={styles.docsHubSubtitle}>{clients.length} clients • {clients.filter(c => c.status === 'active').length} active</Text>
        </View>
        <Pressable onPress={() => {
          resetClientForm();
          setShowCreateClientModal(true);
        }} style={styles.createDocBtn}>
          <Feather name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.createDocBtnText}>Add Client</Text>
        </Pressable>
      </View>
      
      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.docsFilterScroll}>
        <Pressable
          onPress={() => setClientFilterStatus("all")}
          style={[styles.docsFilterChip, clientFilterStatus === "all" && styles.docsFilterChipActive]}
        >
          <Text style={[styles.docsFilterChipText, clientFilterStatus === "all" && styles.docsFilterChipTextActive]}>
            All ({clients.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setClientFilterStatus("active")}
          style={[styles.docsFilterChip, clientFilterStatus === "active" && styles.docsFilterChipActive]}
        >
          <Text style={[styles.docsFilterChipText, clientFilterStatus === "active" && styles.docsFilterChipTextActive]}>
            Active ({clients.filter(c => c.status === 'active').length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setClientFilterStatus("inactive")}
          style={[styles.docsFilterChip, clientFilterStatus === "inactive" && styles.docsFilterChipActive]}
        >
          <Text style={[styles.docsFilterChipText, clientFilterStatus === "inactive" && styles.docsFilterChipTextActive]}>
            Inactive ({clients.filter(c => c.status === 'inactive').length})
          </Text>
        </Pressable>
      </ScrollView>
      
      {/* Clients List */}
      {filteredClients.length === 0 ? (
        <View style={styles.docsEmptyState}>
          <Feather name="users" size={48} color="#D1D5DB" />
          <Text style={styles.docsEmptyTitle}>No clients yet</Text>
          <Text style={styles.docsEmptyText}>Add your first client to get started</Text>
          <Pressable onPress={() => {
            resetClientForm();
            setShowCreateClientModal(true);
          }} style={styles.docsEmptyBtn}>
            <Text style={styles.docsEmptyBtnText}>Add Client</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.docsList}>
          {filteredClients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </View>
      )}
      
      {/* Create/Edit Client Modal */}
      <Modal visible={showCreateClientModal} transparent animationType="slide" onRequestClose={() => {
        setShowCreateClientModal(false);
        resetClientForm();
      }}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContentFull, { backgroundColor: "#FFFFFF" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditingClient ? "Edit Client" : "New Client"}</Text>
              <Pressable onPress={() => {
                setShowCreateClientModal(false);
                resetClientForm();
              }} hitSlop={8}>
                <Feather name="x" size={24} color="#000" />
              </Pressable>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter client name"
                placeholderTextColor="#9CA3AF"
                value={clientFormName}
                onChangeText={setClientFormName}
              />
              
              <Text style={styles.formLabel}>Company</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter company name"
                placeholderTextColor="#9CA3AF"
                value={clientFormCompany}
                onChangeText={setClientFormCompany}
              />
              
              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={styles.formInput}
                placeholder="client@example.com"
                placeholderTextColor="#9CA3AF"
                value={clientFormEmail}
                onChangeText={setClientFormEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              
              <Text style={styles.formLabel}>Phone</Text>
              <TextInput
                style={styles.formInput}
                placeholder="+1 234 567 8900"
                placeholderTextColor="#9CA3AF"
                value={clientFormPhone}
                onChangeText={setClientFormPhone}
                keyboardType="phone-pad"
              />
              
              <Text style={styles.formLabel}>Currency</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {CURRENCIES.map((curr) => (
                  <Pressable
                    key={curr}
                    onPress={() => setClientFormCurrency(curr)}
                    style={[styles.pickerOption, clientFormCurrency === curr && styles.pickerOptionActive]}
                  >
                    <Text style={[styles.pickerOptionText, clientFormCurrency === curr && styles.pickerOptionTextActive]}>{curr}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              
              <Text style={styles.formLabel}>Payment Terms</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {PAYMENT_TERMS.map((term) => (
                  <Pressable
                    key={term}
                    onPress={() => setClientFormPaymentTerms(term)}
                    style={[styles.pickerOption, clientFormPaymentTerms === term && styles.pickerOptionActive]}
                  >
                    <Text style={[styles.pickerOptionText, clientFormPaymentTerms === term && styles.pickerOptionTextActive]}>{term}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              
              <Text style={styles.formLabel}>Tax ID / VAT</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter tax ID or VAT number"
                placeholderTextColor="#9CA3AF"
                value={clientFormTaxId}
                onChangeText={setClientFormTaxId}
              />
              
              <Text style={styles.formLabel}>Internal Notes</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                placeholder="Add internal notes..."
                placeholderTextColor="#9CA3AF"
                value={clientFormInternalNotes}
                onChangeText={setClientFormInternalNotes}
                multiline
                numberOfLines={3}
              />
              
              <Text style={styles.formLabel}>Status</Text>
              <View style={styles.statusPickerRow}>
                <Pressable
                  onPress={() => setClientFormStatus("active")}
                  style={[styles.statusOption, clientFormStatus === "active" && styles.statusOptionActive]}
                >
                  <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
                  <Text style={[styles.statusOptionText, clientFormStatus === "active" && styles.statusOptionTextActive]}>Active</Text>
                </Pressable>
                <Pressable
                  onPress={() => setClientFormStatus("inactive")}
                  style={[styles.statusOption, clientFormStatus === "inactive" && styles.statusOptionActiveInactive]}
                >
                  <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={[styles.statusOptionText, clientFormStatus === "inactive" && styles.statusOptionTextActiveInactive]}>Inactive</Text>
                </Pressable>
              </View>
              
              // In renderClientsContent, the submit button should call saveClient:
{/* In renderClientsContent, the submit button should call saveClient: */}
<Pressable
  onPress={() => {
    console.log("🔵🔵🔵 BUTTON CLICKED INSIDE PRESSABLE 🔵🔵🔵");
    saveClient();
  }}
  disabled={isSubmittingClient}
  style={[styles.submitBtn, isSubmittingClient && styles.submitBtnDisabled]}
>
  <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.submitGradient}>
    {isSubmittingClient ? (
      <ActivityIndicator size="small" color="#FFF" />
    ) : (
      <>
        <Feather name="check" size={18} color="#FFF" />
        <Text style={styles.submitBtnText}>{isEditingClient ? "Update Client" : "Create Client"}</Text>
      </>
    )}
  </LinearGradient>
</Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      
      {/* Client Detail Modal */}
      <Modal visible={showClientDetailModal} transparent animationType="slide" onRequestClose={() => setShowClientDetailModal(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContentFull, { backgroundColor: "#FFFFFF" }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setShowClientDetailModal(false)} hitSlop={8}>
                <Feather name="arrow-left" size={24} color="#000" />
              </Pressable>
              <Text style={styles.modalTitle}>Client Details</Text>
              <Pressable onPress={() => {
                setShowClientDetailModal(false);
                if (selectedClient) editClient(selectedClient);
              }} hitSlop={8}>
                <Feather name="edit-2" size={20} color="#3B82F6" />
              </Pressable>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedClient && (
                <>
                  <View style={[styles.clientDetailStatus, { backgroundColor: selectedClient.status === 'active' ? '#10B98115' : '#EF444415' }]}>
                    <View style={[styles.clientDetailStatusDot, { backgroundColor: selectedClient.status === 'active' ? '#10B981' : '#EF4444' }]} />
                    <Text style={[styles.clientDetailStatusText, { color: selectedClient.status === 'active' ? '#10B981' : '#EF4444' }]}>
                      {selectedClient.status === 'active' ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  
                  <Text style={styles.clientDetailName}>{selectedClient.name}</Text>
                  
                  {selectedClient.company && (
                    <View style={styles.detailRow}>
                      <Feather name="briefcase" size={18} color="#6B7280" />
                      <Text style={styles.detailLabel}>Company</Text>
                      <Text style={styles.detailValue}>{selectedClient.company}</Text>
                    </View>
                  )}
                  
                  {selectedClient.email && (
                    <View style={styles.detailRow}>
                      <Feather name="mail" size={18} color="#6B7280" />
                      <Text style={styles.detailLabel}>Email</Text>
                      <Text style={styles.detailValue}>{selectedClient.email}</Text>
                    </View>
                  )}
                  
                  {selectedClient.phone && (
                    <View style={styles.detailRow}>
                      <Feather name="phone" size={18} color="#6B7280" />
                      <Text style={styles.detailLabel}>Phone</Text>
                      <Text style={styles.detailValue}>{selectedClient.phone}</Text>
                    </View>
                  )}
                  
                  <View style={styles.detailRow}>
                    <Feather name="dollar-sign" size={18} color="#6B7280" />
                    <Text style={styles.detailLabel}>Currency</Text>
                    <Text style={styles.detailValue}>{selectedClient.currency || getCurrencyCode()}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Feather name="calendar" size={18} color="#6B7280" />
                    <Text style={styles.detailLabel}>Payment Terms</Text>
                    <Text style={styles.detailValue}>{selectedClient.paymentTerms || "Net 30"}</Text>
                  </View>
                  
                  {selectedClient.taxId && (
                    <View style={styles.detailRow}>
                      <Feather name="file-text" size={18} color="#6B7280" />
                      <Text style={styles.detailLabel}>Tax ID / VAT</Text>
                      <Text style={styles.detailValue}>{selectedClient.taxId}</Text>
                    </View>
                  )}
                  
                  {selectedClient.internalNotes && (
                    <View style={styles.detailRow}>
                      <Feather name="clipboard" size={18} color="#6B7280" />
                      <Text style={styles.detailLabel}>Notes</Text>
                      <Text style={styles.detailValue}>{selectedClient.internalNotes}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const renderBooksContent = () => {
  
  // Get ONLY business books (category === "book" or no category)
  const businessBooks = books.filter(b => {
    if (b.type !== "business") return false;
    if (!b.category || b.category === "") return true;
    if (b.category === "book") return true;
    const accountCategories = ['bank', 'credit-card', 'investment', 'assets'];
    if (accountCategories.includes(b.category)) return false;
    return true;
  });
  
  // Function to create a book
  const handleCreateBookOnly = async () => {
    if (!localNewBookName.trim()) {
      Alert.alert("Error", "Please enter a book name");
      return;
    }
    
    if (!user) {
      Alert.alert("Error", "You must be logged in");
      return;
    }
    
    try {
      const newBookData = {
        name: localNewBookName,
        description: localNewBookDescription || "",
        type: "business",
        category: "book",
        isCloud: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        userId: user.id,
        role: "owner",
        icon: "📚",
        color: "#" + Math.floor(Math.random()*16777215).toString(16),
      };
      
      console.log("🔵 Creating BOOK from Books page:", newBookData);
      
      const booksRef = collection(db, 'books');
      await addDoc(booksRef, newBookData);
      
      await refreshBooks();
      setRefreshTrigger(prev => prev + 1);
      
      Alert.alert("Success", "Book created successfully!");
      setLocalShowBookModal(false);
      setLocalNewBookName("");
      setLocalNewBookDescription("");
      
    } catch (error) {
      console.error("Error creating book:", error);
      Alert.alert("Error", "Failed to create book");
    }
  };
  
  // Toggle book expansion
  const toggleBookExpansion = (bookId: string) => {
    setExpandedBookId(expandedBookId === bookId ? null : bookId);
  };
  
  // Get transactions for a specific book
  const getBookTransactions = (bookId: string) => {
    const txToUse = selectedView === "business" ? allTransactionsForBusiness : transactions;
    return txToUse?.filter(t => t.bookId === bookId) || [];
  };
  
  return (
    <View style={styles.booksSection}>
      <View style={styles.businessHeader}>
        <Text style={styles.businessTitle}>Books</Text>
        <View style={styles.businessHeaderButtons}>
          <Pressable 
            onPress={() => { 
              setLocalNewBookName("");
              setLocalNewBookDescription("");
              setLocalShowBookModal(true); 
            }} 
            style={styles.businessAddAccountBtn}
          >
            <Feather name="plus" size={16} color="#3B82F6" />
            <Text style={styles.businessAddAccountText}>Add Book</Text>
          </Pressable>
        </View>
      </View>
      
      {businessBooks.length > 0 ? (
        <View style={styles.accountCategorySection}>
          <Text style={styles.accountCategoryTitle}>BUSINESS BOOKS</Text>
          <View style={styles.accountCardsContainer}>
            {businessBooks.map((book) => {
              const balance = getBookBalance(book.id);
              const isLinked = book.userId !== user?.id;
              const bookTransactions = getBookTransactions(book.id);
              const isExpanded = expandedBookId === book.id;
              
              return (
                <View key={book.id} style={styles.bookContainer}>
                  <Pressable 
                    onPress={() => toggleBookExpansion(book.id)} 
                    style={styles.accountCard}
                  >
                    <View style={[styles.accountCardIcon, { backgroundColor: '#8B5CF615' }]}>
                      <Feather name="book-open" size={22} color="#8B5CF6" />
                    </View>
                    <View style={styles.accountCardInfo}>
                      <Text style={styles.accountCardName}>{book.name}</Text>
                      <View style={styles.accountCardChips}>
                        {isLinked && (
                          <View style={[styles.chip, styles.linkedChip]}>
                            <Feather name="link" size={10} color="#10B981" />
                            <Text style={styles.chipTextLinked}>Linked</Text>
                          </View>
                        )}
                        <View style={[styles.chip, styles.businessChip]}>
                          <Feather name="book-open" size={10} color="#8B5CF6" />
                          <Text style={styles.chipTextBusiness}>Book</Text>
                        </View>
                        <View style={[styles.chip, { backgroundColor: '#E5E7EB' }]}>
                          <Text style={[styles.chipTextBusiness, { color: '#6B7280' }]}>
                            {bookTransactions.length} txns
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.accountCardBalance, { color: balance >= 0 ? '#10B981' : '#EF4444' }]}>
                        {getCurrencyCode()} {Math.abs(balance).toLocaleString('en-EG')}
                      </Text>
                      <Feather 
                        name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                        size={20} 
                        color="#9CA3AF" 
                      />
                    </View>
                  </Pressable>
                  
                  {isExpanded && (
                    <View style={styles.expandedTransactionsContainer}>
                      <View style={styles.expandedHeader}>
                        <Text style={styles.expandedTitle}>Transactions</Text>
                        <Pressable 
                          onPress={() => {
                            setActiveBook(book);
                            router.push("/add-transaction");
                          }} 
                          style={styles.expandedAddBtn}
                        >
                          <Feather name="plus-circle" size={16} color="#FFFFFF" />
                          <Text style={styles.expandedAddBtnText}>Add</Text>
                        </Pressable>
                      </View>
                      
                      {bookTransactions.length === 0 ? (
                        <View style={styles.emptyTransactionsState}>
                          <Feather name="inbox" size={32} color="#D1D5DB" />
                          <Text style={styles.emptyTransactionsText}>No transactions yet</Text>
                          <Pressable 
                            onPress={() => {
                              setActiveBook(book);
                              router.push("/add-transaction");
                            }} 
                            style={styles.emptyAddBtn}
                          >
                            <Text style={styles.emptyAddBtnText}>Add your first transaction</Text>
                          </Pressable>
                        </View>
                      ) : (
                        bookTransactions.slice(0, 5).map((tx) => (
                          <View key={tx.id} style={styles.expandedTxItem}>
                            <View style={[styles.expandedTxIcon, { backgroundColor: tx.type === 'income' ? '#10B98120' : '#EF444420' }]}>
                              <Feather name={tx.type === 'income' ? 'trending-up' : 'trending-down'} size={16} color={tx.type === 'income' ? '#10B981' : '#EF4444'} />
                            </View>
                            <View style={styles.expandedTxInfo}>
                              <Text style={styles.expandedTxCategory}>{tx.category}</Text>
                              <Text style={styles.expandedTxDate}>{formatDate(tx.createdAt)}</Text>
                            </View>
                            <Text style={[styles.expandedTxAmount, { color: tx.type === 'income' ? '#10B981' : '#EF4444' }]}>
                              {tx.type === 'income' ? '+' : '-'} {getCurrencyCode()} {tx.amount.toLocaleString('en-EG')}
                            </Text>
                          </View>
                        ))
                      )}
                      
                      {bookTransactions.length > 5 && (
                        <Pressable 
                          onPress={() => {
                            setActiveBook(book);
                            handleOpenBook(book);
                          }} 
                          style={styles.viewAllBtn}
                        >
                          <Text style={styles.viewAllBtnText}>View all {bookTransactions.length} transactions</Text>
                          <Feather name="arrow-right" size={14} color="#3B82F6" />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.emptyBusinessState}>
          <Feather name="book-open" size={48} color="#D1D5DB" />
          <Text style={styles.emptyBusinessTitle}>No Business Books Yet</Text>
          <Text style={styles.emptyBusinessText}>Create your first business book to get started</Text>
          <Pressable 
            onPress={() => { 
              setLocalNewBookName("");
              setLocalNewBookDescription("");
              setLocalShowBookModal(true); 
            }} 
            style={styles.emptyBusinessBtn}
          >
            <Text style={styles.emptyBusinessBtnText}>Create Book</Text>
          </Pressable>
        </View>
      )}
      
      {/* Create Book Modal - LOCAL TO BOOKS PAGE */}
      <Modal visible={localShowBookModal} transparent animationType="slide" onRequestClose={() => setLocalShowBookModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.createBookModal, { backgroundColor: '#FFFFFF' }]}>
            <View style={styles.createBookModalHeader}>
              <Text style={styles.createBookModalTitle}>Create New Book</Text>
              <Pressable onPress={() => setLocalShowBookModal(false)} hitSlop={8}>
                <Feather name="x" size={24} color="#6B7280" />
              </Pressable>
            </View>
            
            <Text style={styles.createBookLabel}>Book Name</Text>
            <TextInput 
              style={styles.createBookInput} 
              placeholder="Enter book name" 
              placeholderTextColor="#9CA3AF" 
              value={localNewBookName} 
              onChangeText={setLocalNewBookName} 
            />
            
            <Text style={styles.createBookLabel}>Description (Optional)</Text>
            <TextInput 
              style={[styles.createBookInput, styles.createBookTextArea]} 
              placeholder="Add a description" 
              placeholderTextColor="#9CA3AF" 
              value={localNewBookDescription} 
              onChangeText={setLocalNewBookDescription} 
              multiline 
              numberOfLines={3} 
            />
            
            <View style={styles.createBookActions}>
              <Pressable 
                onPress={() => setLocalShowBookModal(false)} 
                style={[styles.createBookCancel, { backgroundColor: '#F3F4F6' }]}
              >
                <Text style={[styles.createBookCancelText, { color: '#6B7280' }]}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleCreateBookOnly} 
                style={[styles.createBookConfirm, { backgroundColor: '#3B82F6' }]}
              >
                <Text style={styles.createBookConfirmText}>Create Book</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
// Render Reports Page (Business) - REMOVED BUDGETS, GOALS, AND RECURRING
const renderReportsContent = () => {
  // Report configurations - REMOVED budgets, goalProjections, and recurring
  const REPORTS = [
    { id: "netWorth", name: "Net Worth", icon: "trending-up", color: "#3B82F6" },
    { id: "accounts", name: "Accounts", icon: "briefcase", color: "#10B981" },
    { id: "incomeVsExpenses", name: "Income vs Expenses", icon: "bar-chart-2", color: "#8B5CF6" },
    { id: "spendingByCategory", name: "Spending by Category", icon: "pie-chart", color: "#F59E0B" },
    { id: "cashFlow", name: "Cash Flow", icon: "activity", color: "#EC4899" },
    { id: "transactions", name: "Transactions", icon: "list", color: "#6B7280" },
  ];

  const selectedCount = selectedReports.size;

  // Report Card Component with better font styling
  const ReportCard = ({ report }: { report: typeof REPORTS[0] }) => {
    const isSelected = selectedReports.has(report.id);
    const isActive = selectedReport === report.id;
    
    return (
      <Pressable 
        onPress={() => {
          setSelectedReport(report.id);
          handlePreview(report.id);
        }}
        style={[styles.reportCard, isActive && { borderColor: report.color, borderWidth: 2 }]}
      >
        <View style={styles.reportCardHeader}>
          <View style={[styles.reportCardIcon, { backgroundColor: report.color + '15' }]}>
            <Feather name={report.icon as any} size={20} color={report.color} />
          </View>
          <Text style={[styles.reportCardName, { fontFamily: "Inter_600SemiBold" }]}>{report.name}</Text>
          <Pressable 
            onPress={(e) => {
              e.stopPropagation();
              toggleReportSelection(report.id);
            }}
            style={[styles.reportCheckbox, isSelected && styles.reportCheckboxSelected]}
          >
            {isSelected && <Feather name="check" size={14} color="#FFF" />}
          </Pressable>
        </View>
        {isActive && (
          <View style={styles.reportCardPreview}>
            <Text style={[styles.reportCardPreviewText, { fontFamily: "Inter_400Regular" }]}>
              Tap to view full report
            </Text>
          </View>
        )}
      </Pressable>
    );
  };
  
  return (
    <>
      {/* Reports Header */}
      <View style={styles.docsTitleSection}>
        <View>
          <Text style={[styles.docsHubTitle, { fontFamily: "Inter_700Bold" }]}>Reports & Insights</Text>
          <Text style={[styles.docsHubSubtitle, { fontFamily: "Inter_400Regular" }]}>Comprehensive financial analysis</Text>
        </View>
      </View>
      
      {/* Action Chips */}
      <View style={styles.reportActionRow}>
        <Pressable onPress={resetReports} style={styles.reportActionChip}>
          <Feather name="refresh-cw" size={14} color="#3B82F6" />
          <Text style={[styles.reportActionText, { fontFamily: "Inter_500Medium" }]}>Reset</Text>
        </Pressable>
        <Pressable onPress={selectAllReports} style={styles.reportActionChip}>
          <Feather name="check-square" size={14} color="#3B82F6" />
          <Text style={[styles.reportActionText, { fontFamily: "Inter_500Medium" }]}>All</Text>
        </Pressable>
        <Pressable onPress={selectNoneReports} style={styles.reportActionChip}>
          <Feather name="square" size={14} color="#3B82F6" />
          <Text style={[styles.reportActionText, { fontFamily: "Inter_500Medium" }]}>None</Text>
        </Pressable>
        <Pressable onPress={generatePDF} style={[styles.reportActionChip, styles.reportActionChipPrimary]}>
          <Feather name="share-2" size={14} color="#FFFFFF" />
          <Text style={[styles.reportActionText, { color: "#FFFFFF", fontFamily: "Inter_500Medium" }]}>Share</Text>
        </Pressable>
      </View>
      
      {/* Export Full Counter */}
      <View style={styles.reportExportCounter}>
        <Text style={[styles.reportExportText, { fontFamily: "Inter_400Regular" }]}>
          {selectedCount} report{selectedCount !== 1 ? 's' : ''} selected for export
        </Text>
        {selectedCount > 0 && (
          <Pressable onPress={generatePDF} style={styles.reportExportBtn}>
            <Feather name="download" size={16} color="#FFFFFF" />
            <Text style={[styles.reportExportBtnText, { fontFamily: "Inter_500Medium" }]}>Export Full ({selectedCount})</Text>
          </Pressable>
        )}
      </View>
      
      {/* Report Cards Grid */}
      <View style={styles.reportCardsGrid}>
        {REPORTS.map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </View>
      
      {/* Preview Modal */}
      <Modal visible={showPreviewModal} transparent animationType="slide" onRequestClose={() => setShowPreviewModal(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContentFull, { backgroundColor: "#FFFFFF", maxWidth: 600 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { fontFamily: "Inter_700Bold" }]}>
                {previewReport?.report?.name || "Report Preview"}
              </Text>
              <Pressable onPress={() => setShowPreviewModal(false)} hitSlop={8}>
                <Feather name="x" size={24} color="#000" />
              </Pressable>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {previewReport?.report?.id === "netWorth" && (
                <>
                  <View style={styles.previewStatsGrid}>
                    <View style={styles.previewStatCard}>
                      <Text style={[styles.previewStatLabel, { fontFamily: "Inter_500Medium" }]}>Total Income</Text>
                      <Text style={[styles.previewStatValue, { color: '#10B981', fontFamily: "Inter_700Bold" }]}>
                        {getCurrencyCode()} {previewReport.data?.totalIncome?.toLocaleString() || 0}
                      </Text>
                    </View>
                    <View style={styles.previewStatCard}>
                      <Text style={[styles.previewStatLabel, { fontFamily: "Inter_500Medium" }]}>Total Expenses</Text>
                      <Text style={[styles.previewStatValue, { color: '#EF4444', fontFamily: "Inter_700Bold" }]}>
                        {getCurrencyCode()} {previewReport.data?.totalExpense?.toLocaleString() || 0}
                      </Text>
                    </View>
                    <View style={styles.previewStatCard}>
                      <Text style={[styles.previewStatLabel, { fontFamily: "Inter_500Medium" }]}>Net Worth</Text>
                      <Text style={[styles.previewStatValue, { color: '#3B82F6', fontFamily: "Inter_700Bold" }]}>
                        {getCurrencyCode()} {previewReport.data?.netWorth?.toLocaleString() || 0}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => generatePDF()} style={styles.previewExportBtn}>
                    <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.previewExportGradient}>
                      <Feather name="download" size={18} color="#FFF" />
                      <Text style={[styles.previewExportText, { fontFamily: "Inter_600SemiBold" }]}>Export This Report</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              )}
              
              {previewReport?.report?.id === "accounts" && (
                <>
                  {previewReport.data?.map((account: any, idx: number) => (
                    <View key={idx} style={styles.previewRow}>
                      <Text style={[styles.previewLabel, { fontFamily: "Inter_500Medium" }]}>{account.name}</Text>
                      <Text style={[styles.previewValue, { color: account.balance >= 0 ? '#10B981' : '#EF4444', fontFamily: "Inter_600SemiBold" }]}>
                        {getCurrencyCode()} {Math.abs(account.balance).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                  <Pressable onPress={() => generatePDF()} style={styles.previewExportBtn}>
                    <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.previewExportGradient}>
                      <Feather name="download" size={18} color="#FFF" />
                      <Text style={[styles.previewExportText, { fontFamily: "Inter_600SemiBold" }]}>Export This Report</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              )}
              
              {previewReport?.report?.id === "incomeVsExpenses" && (
                <>
                  <View style={styles.previewStatsGrid}>
                    <View style={styles.previewStatCard}>
                      <Text style={[styles.previewStatLabel, { fontFamily: "Inter_500Medium" }]}>Income</Text>
                      <Text style={[styles.previewStatValue, { color: '#10B981', fontFamily: "Inter_700Bold" }]}>
                        {getCurrencyCode()} {previewReport.data?.income?.toLocaleString() || 0}
                      </Text>
                    </View>
                    <View style={styles.previewStatCard}>
                      <Text style={[styles.previewStatLabel, { fontFamily: "Inter_500Medium" }]}>Expenses</Text>
                      <Text style={[styles.previewStatValue, { color: '#EF4444', fontFamily: "Inter_700Bold" }]}>
                        {getCurrencyCode()} {previewReport.data?.expense?.toLocaleString() || 0}
                      </Text>
                    </View>
                    <View style={styles.previewStatCard}>
                      <Text style={[styles.previewStatLabel, { fontFamily: "Inter_500Medium" }]}>Savings</Text>
                      <Text style={[styles.previewStatValue, { color: '#3B82F6', fontFamily: "Inter_700Bold" }]}>
                        {getCurrencyCode()} {previewReport.data?.savings?.toLocaleString() || 0}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => generatePDF()} style={styles.previewExportBtn}>
                    <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.previewExportGradient}>
                      <Feather name="download" size={18} color="#FFF" />
                      <Text style={[styles.previewExportText, { fontFamily: "Inter_600SemiBold" }]}>Export This Report</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              )}
              
              {previewReport?.report?.id === "spendingByCategory" && (
                <>
                  {previewReport.data?.map((category: any, idx: number) => (
                    <View key={idx} style={styles.previewRow}>
                      <Text style={[styles.previewLabel, { fontFamily: "Inter_500Medium" }]}>{category.name}</Text>
                      <Text style={[styles.previewValue, { color: '#EF4444', fontFamily: "Inter_600SemiBold" }]}>
                        {getCurrencyCode()} {category.amount.toLocaleString()}
                      </Text>
                    </View>
                  ))}
                  <Pressable onPress={() => generatePDF()} style={styles.previewExportBtn}>
                    <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.previewExportGradient}>
                      <Feather name="download" size={18} color="#FFF" />
                      <Text style={[styles.previewExportText, { fontFamily: "Inter_600SemiBold" }]}>Export This Report</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              )}
              
              {previewReport?.report?.id === "cashFlow" && (
                <>
                  {previewReport.data?.map((month: any, idx: number) => (
                    <View key={idx} style={styles.previewRow}>
                      <Text style={[styles.previewLabel, { fontFamily: "Inter_500Medium" }]}>{month.month}</Text>
                      <View style={styles.previewCashFlowValues}>
                        <Text style={{ color: '#10B981', fontFamily: "Inter_500Medium" }}>+{getCurrencyCode()} {month.income.toLocaleString()}</Text>
                        <Text style={{ color: '#EF4444', fontFamily: "Inter_500Medium" }}>-{getCurrencyCode()} {month.expense.toLocaleString()}</Text>
                        <Text style={{ color: '#3B82F6', fontWeight: 'bold', fontFamily: "Inter_600SemiBold" }}>Net: {getCurrencyCode()} {month.net.toLocaleString()}</Text>
                      </View>
                    </View>
                  ))}
                  <Pressable onPress={() => generatePDF()} style={styles.previewExportBtn}>
                    <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.previewExportGradient}>
                      <Feather name="download" size={18} color="#FFF" />
                      <Text style={[styles.previewExportText, { fontFamily: "Inter_600SemiBold" }]}>Export This Report</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              )}
              
              {previewReport?.report?.id === "transactions" && (
                <>
                  {previewReport.data?.map((tx: any, idx: number) => (
                    <View key={idx} style={styles.previewRow}>
                      <View>
                        <Text style={[styles.previewLabel, { fontFamily: "Inter_500Medium" }]}>{tx.category}</Text>
                        <Text style={[styles.previewDate, { fontFamily: "Inter_400Regular" }]}>{formatDate(tx.date || tx.createdAt)}</Text>
                      </View>
                      <Text style={[styles.previewValue, { color: tx.type === 'income' ? '#10B981' : '#EF4444', fontFamily: "Inter_600SemiBold" }]}>
                        {tx.type === 'income' ? '+' : '-'} {getCurrencyCode()} {tx.amount.toLocaleString()}
                      </Text>
                    </View>
                  ))}
                  <Pressable onPress={() => generatePDF()} style={styles.previewExportBtn}>
                    <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.previewExportGradient}>
                      <Feather name="download" size={18} color="#FFF" />
                      <Text style={[styles.previewExportText, { fontFamily: "Inter_600SemiBold" }]}>Export This Report</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

  // Render Settings Page
  const renderSettingsContent = () => (
    <View style={styles.settingsSection}>
      <Text style={styles.businessTitle}>Settings</Text>
      <Pressable onPress={() => setProfileModalVisible(true)} style={styles.settingsButton}>
        <Feather name="user" size={20} color="#3B82F6" />
        <Text style={styles.settingsButtonText}>Profile Settings</Text>
      </Pressable>
    </View>
  );

  // Main render function to determine which content to show
  const renderPageContent = () => {
    if (selectedView === "personal") {
      switch(currentPage) {
        case "home": return renderHomeContent();
        case "accounts": return renderAccountsContent();
        case "transactions": return renderTransactionsContent();
        case "budgets": return renderBudgetsContent();
        case "goals": return renderGoalsContent();
        case "settings": return renderSettingsContent();
        default: return renderHomeContent();
      }
    } else {
      switch(currentPage) {
        case "home": return renderHomeContent();
        case "docs": return renderDocsContent();
        case "clients": return renderClientsContent();
        case "books": return renderBooksContent();
        case "reports": return renderReportsContent();
        case "settings": return renderSettingsContent();
        default: return renderHomeContent();
      }
    }
  };

  // Render Home Page Content
  // Render Home Page Content - MODIFIED TO SHOW ONLY ACCOUNTS WITH TRANSACTION OPTIONS
const renderHomeContent = () => (
  <>
    <View style={styles.greetingSectionNew}>
      <Text style={styles.greetingTextNew}>{getGreeting()},</Text>
      <Text style={styles.userNameTextNew}>{getGreetingName()}!</Text>
      <Text style={styles.snapshotText}>Your {selectedView === "personal" ? "personal" : "business"} financial snapshot</Text>
    </View>

    {selectedView === "personal" ? (
      // ========== PERSONAL VIEW ==========
      <>
        <View style={styles.liquidCashCard}>
          <LinearGradient colors={['#3B82F6', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liquidCardGradient} />
          <View style={styles.liquidCardHeader}>
            <View>
              <Text style={styles.liquidCashLabel}>LIQUID CASH</Text>
              <Text style={styles.liquidCashAmount}>{getCurrencyCode()} {personalStats.totalBalance.toLocaleString('en-EG')}</Text>
            </View>
            <View style={styles.liveChip}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statLabel, { textAlign: 'left', color: '#10B981' }]}>Investment</Text>
              <Text style={[styles.statAmount, { textAlign: 'left' }]}>{getCurrencyCode()} {personalStats.investmentTotal.toLocaleString('en-EG')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statLabel, { textAlign: 'left', color: '#EF4444' }]}>Debt</Text>
              <Text style={[styles.statAmount, { textAlign: 'left' }]}>{getCurrencyCode()} {personalStats.debtTotal.toLocaleString('en-EG')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.safeSpendCard}>
          <View style={styles.safeSpendHeader}>
            <Text style={styles.safeSpendLabel}>Safe to spend</Text>
            <View style={[styles.healthyChip, { backgroundColor: personalStats.isHealthy ? '#10B98120' : '#EF444420' }]}>
              <Text style={[styles.healthyText, { color: personalStats.isHealthy ? '#10B981' : '#EF4444' }]}>{personalStats.isHealthy ? "Healthy" : "Warning"}</Text>
            </View>
          </View>
          <Text style={styles.safeSpendAmount}>{getCurrencyCode()} {personalStats.safeToSpend.toLocaleString('en-EG')}</Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${personalStats.spentPercentage}%`, backgroundColor: '#3B82F6' }]} />
          </View>
          <Text style={styles.progressText}>{personalStats.spentPercentage.toFixed(0)}% spent of safe amount</Text>
        </View>

        <View style={styles.recentTransactionsSection}>
          <Text style={styles.recentTransactionsTitle}>Recent Transactions</Text>
          {personalTransactions.length === 0 ? (
            <View style={styles.noTransactionsCard}>
              <Feather name="credit-card" size={32} color="#9CA3AF" />
              <Text style={styles.noTransactionsText}>No transactions yet</Text>
              <Text style={styles.noTransactionsSubtext}>Tap the + button to add your first transaction</Text>
            </View>
          ) : (
            personalTransactions.slice(0, 5).map((tx) => (
              <View key={tx.id} style={styles.recentTxItem}>
                <View style={[styles.recentTxIcon, { backgroundColor: tx.type === 'income' ? '#10B98120' : '#EF444420' }]}>
                  <Feather name={tx.type === 'income' ? 'trending-up' : 'trending-down'} size={18} color={tx.type === 'income' ? '#10B981' : '#EF4444'} />
                </View>
                <View style={styles.recentTxInfo}>
                  <Text style={styles.recentTxCategory}>{tx.category}</Text>
                  <Text style={styles.recentTxDate}>{formatDate(tx.createdAt)}</Text>
                </View>
                <Text style={[styles.recentTxAmount, { color: tx.type === 'income' ? '#10B981' : '#EF4444' }]}>
                  {tx.type === 'income' ? '+' : '-'} {getCurrencyCode()} {tx.amount.toLocaleString('en-EG')}
                </Text>
              </View>
            ))
          )}
        </View>
      </>
    ) : (
      // ========== BUSINESS VIEW HOME - ONLY ACCOUNTS ==========
      <>
        <View style={styles.businessHeader}>
          <Text style={styles.businessTitle}>Accounts</Text>
          <View style={styles.businessHeaderButtons}>
            <Pressable onPress={() => { 
              setNewBookType("business"); 
              setNewBookCategory("assets");
              setShowCreateBookModal(true); 
            }} style={styles.businessAddAccountBtn}>
              <Feather name="plus" size={16} color="#3B82F6" />
              <Text style={styles.businessAddAccountText}>Add Account</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.businessStatsRow}>
          <View style={[styles.businessStatCardSmall, { backgroundColor: '#F0FDF4' }]}>
            <Text style={styles.businessStatEmoji}>📈</Text>
            <Text style={styles.businessStatLabelSmall}>Total Assets</Text>
            <Text style={[styles.businessStatAmountSmall, { color: '#10B981' }]}>{getCurrencyCode()} {businessStats.totalAssets.toLocaleString('en-EG')}</Text>
          </View>
          <View style={[styles.businessStatCardSmall, { backgroundColor: '#FEF2F2' }]}>
            <Text style={styles.businessStatEmoji}>📉</Text>
            <Text style={styles.businessStatLabelSmall}>Total Liabilities</Text>
            <Text style={[styles.businessStatAmountSmall, { color: '#EF4444' }]}>{getCurrencyCode()} {businessStats.totalLiabilities.toLocaleString('en-EG')}</Text>
          </View>
          <View style={[styles.businessStatCardSmall, { backgroundColor: '#EFF6FF' }]}>
            <Text style={styles.businessStatEmoji}>💎</Text>
            <Text style={styles.businessStatLabelSmall}>Net Worth</Text>
            <Text style={[styles.businessStatAmountSmall, { color: '#1F2937' }]}>{getCurrencyCode()} {businessStats.netWorth.toLocaleString('en-EG')}</Text>
          </View>
        </View>

        {/* Get ONLY business accounts (NOT books) */}
        {(() => {
          const businessAccounts = books.filter(b => {
            if (b.type !== "business") return false;
            if (!b.category) return false;
            if (b.category === "book") return false;
            const accountCategories = ['bank', 'credit-card', 'investment', 'assets'];
            return accountCategories.includes(b.category);
          });

          const categorizedHomeAccounts = {
            banks: businessAccounts.filter(b => b.category === "bank"),
            creditCards: businessAccounts.filter(b => b.category === "credit-card"),
            investments: businessAccounts.filter(b => b.category === "investment"),
            assets: businessAccounts.filter(b => b.category === "assets"),
          };

          const homeAccountCategories = [
            { id: 'banks', name: 'BANK ACCOUNTS', icon: 'briefcase', color: '#3B82F6', books: categorizedHomeAccounts.banks },
            { id: 'creditCards', name: 'CREDIT CARDS', icon: 'credit-card', color: '#EF4444', books: categorizedHomeAccounts.creditCards },
            { id: 'investments', name: 'INVESTMENTS', icon: 'trending-up', color: '#10B981', books: categorizedHomeAccounts.investments },
            { id: 'assets', name: 'ASSETS', icon: 'package', color: '#F59E0B', books: categorizedHomeAccounts.assets },
          ].filter(cat => cat.books.length > 0);

          if (homeAccountCategories.length === 0) {
            return (
              <View style={styles.emptyBusinessState}>
                <Feather name="briefcase" size={48} color="#D1D5DB" />
                <Text style={styles.emptyBusinessTitle}>No Business Accounts Yet</Text>
                <Text style={styles.emptyBusinessText}>Create your first business account to get started</Text>
                <Pressable onPress={() => { 
                  setNewBookType("business"); 
                  setNewBookCategory("assets");
                  setShowCreateBookModal(true); 
                }} style={styles.emptyBusinessBtn}>
                  <Text style={styles.emptyBusinessBtnText}>Create Account</Text>
                </Pressable>
              </View>
            );
          }

          return homeAccountCategories.map((category) => (
            <View key={category.id} style={styles.accountCategorySection}>
              <Text style={styles.accountCategoryTitle}>{category.name}</Text>
              <View style={styles.accountCardsContainer}>
                {category.books.map((book) => {
                  const balance = getBookBalance(book.id);
                  const isLinked = book.userId !== user?.id;
                  const bookTransactions = allTransactionsForBusiness?.filter(t => t.bookId === book.id) || [];
                  const isExpanded = expandedAccountId === book.id;
                  
                  return (
                    <View key={book.id} style={styles.bookContainer}>
                      {/* Account Card - Click to expand */}
                      <Pressable 
                        onPress={() => {
                          setExpandedAccountId(expandedAccountId === book.id ? null : book.id);
                        }} 
                        style={styles.accountCard}
                      >
                        <View style={[styles.accountCardIcon, { backgroundColor: `${category.color}15` }]}>
                          <Feather name={category.icon as any} size={22} color={category.color} />
                        </View>
                        <View style={styles.accountCardInfo}>
                          <Text style={styles.accountCardName}>{book.name}</Text>
                          <View style={styles.accountCardChips}>
                            {isLinked && (
                              <View style={[styles.chip, styles.linkedChip]}>
                                <Feather name="link" size={10} color="#10B981" />
                                <Text style={styles.chipTextLinked}>Linked</Text>
                              </View>
                            )}
                            <View style={[styles.chip, styles.businessChip]}>
                              <Feather name="briefcase" size={10} color="#F59E0B" />
                              <Text style={styles.chipTextBusiness}>Business</Text>
                            </View>
                            <View style={[styles.chip, { backgroundColor: '#E5E7EB' }]}>
                              <Text style={[styles.chipTextBusiness, { color: '#6B7280' }]}>
                                {bookTransactions.length} txns
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.accountCardBalance, { color: balance >= 0 ? '#10B981' : '#EF4444' }]}>
                            {getCurrencyCode()} {Math.abs(balance).toLocaleString('en-EG')}
                          </Text>
                          <Feather 
                            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                            size={20} 
                            color="#9CA3AF" 
                          />
                        </View>
                      </Pressable>
                      
                      {/* Expanded Transactions List */}
                      {isExpanded && (
                        <View style={styles.expandedTransactionsContainer}>
                          <View style={styles.expandedHeader}>
                            <Text style={styles.expandedTitle}>Transactions</Text>
                            <Pressable 
                              onPress={() => {
                                setActiveBook(book);
                                router.push("/add-transaction");
                              }} 
                              style={styles.expandedAddBtn}
                            >
                              <Feather name="plus-circle" size={16} color="#FFFFFF" />
                              <Text style={styles.expandedAddBtnText}>Add</Text>
                            </Pressable>
                          </View>
                          
                          {bookTransactions.length === 0 ? (
                            <View style={styles.emptyTransactionsState}>
                              <Feather name="inbox" size={32} color="#D1D5DB" />
                              <Text style={styles.emptyTransactionsText}>No transactions yet</Text>
                              <Pressable 
                                onPress={() => {
                                  setActiveBook(book);
                                  router.push("/add-transaction");
                                }} 
                                style={styles.emptyAddBtn}
                              >
                                <Text style={styles.emptyAddBtnText}>Add your first transaction</Text>
                              </Pressable>
                            </View>
                          ) : (
                            bookTransactions.slice(0, 5).map((tx) => (
                              <View key={tx.id} style={styles.expandedTxItem}>
                                <View style={[styles.expandedTxIcon, { backgroundColor: tx.type === 'income' ? '#10B98120' : '#EF444420' }]}>
                                  <Feather name={tx.type === 'income' ? 'trending-up' : 'trending-down'} size={16} color={tx.type === 'income' ? '#10B981' : '#EF4444'} />
                                </View>
                                <View style={styles.expandedTxInfo}>
                                  <Text style={styles.expandedTxCategory}>{tx.category}</Text>
                                  <Text style={styles.expandedTxDate}>{formatDate(tx.createdAt)}</Text>
                                </View>
                                <Text style={[styles.expandedTxAmount, { color: tx.type === 'income' ? '#10B981' : '#EF4444' }]}>
                                  {tx.type === 'income' ? '+' : '-'} {getCurrencyCode()} {tx.amount.toLocaleString('en-EG')}
                                </Text>
                              </View>
                            ))
                          )}
                          
                          {bookTransactions.length > 5 && (
                            <Pressable 
                              onPress={() => {
                                setActiveBook(book);
                                handleOpenBook(book);
                              }} 
                              style={styles.viewAllBtn}
                            >
                              <Text style={styles.viewAllBtnText}>View all {bookTransactions.length} transactions</Text>
                              <Feather name="arrow-right" size={14} color="#3B82F6" />
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ));
        })()}
      </>
    )}
  </>
);

  return (
    <View style={[styles.container, { backgroundColor: '#FFFFFF', flex: 1 }]}>
      <ProfileModal 
        visible={profileModalVisible} 
        onClose={() => setProfileModalVisible(false)} 
        theme={theme} 
        isDark={isDark} 
        onLogout={handleLogout} 
        onDeleteAccount={handleDeleteAccount}
        onProfileUpdate={refreshProfileData}
      />
      
      <ScrollView 
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 80 }]} 
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRowNew}>
          <Image source={favicon} style={styles.headerLogoSmall} resizeMode="contain" />
          <View style={styles.selectorContainer}>
            <Pressable onPress={() => handleViewChange("personal")} style={[styles.selectorOption, selectedView === "personal" && styles.selectorActive]}>
              <Text style={[styles.selectorText, selectedView === "personal" && styles.selectorTextActive]}>Personal</Text>
            </Pressable>
            <Pressable onPress={() => handleViewChange("business")} style={[styles.selectorOption, selectedView === "business" && styles.selectorActive]}>
              <Text style={[styles.selectorText, selectedView === "business" && styles.selectorTextActive]}>Business</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setProfileModalVisible(true)} style={styles.notificationBtnSmall}>
            {profilePhoto ? <Image source={{ uri: profilePhoto }} style={styles.headerAvatarSmall} /> : <Feather name="user" size={20} color="#3B82F6" />}
          </Pressable>
        </View>

        {/* Dynamic Page Content */}
        {renderPageContent()}
      </ScrollView>

      {/* Bottom Tab Bar */}
      {/* Bottom Tab Bar */}
{/* Bottom Tab Bar */}
<BottomTabBar 
  key={selectedView} // ← This forces recreation
  selectedView={selectedView} 
  currentPage={currentPage}
  onPageChange={(page) => {
    console.log("📱 Tab clicked:", page);
    setCurrentPage(page);
  }}
/>

      {/* FAB for Personal View - only show on home and transactions pages */}
      {selectedView === "personal" && (currentPage === "home" || currentPage === "transactions") && (
        <Pressable onPress={handleAddPersonalTransaction} style={styles.personalFabButton}>
          <LinearGradient colors={['#3B82F6', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.personalFabGradient}>
            <Feather name="plus" size={24} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      )}

      {/* Create Book Modal */}
      <Modal visible={showCreateBookModal} transparent animationType="slide" onRequestClose={() => setShowCreateBookModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.createBookModal, { backgroundColor: '#FFFFFF' }]}>
            <View style={styles.createBookModalHeader}>
              <Text style={styles.createBookModalTitle}>Create New {newBookType === "personal" ? "Book" : "Account"}</Text>
              <Pressable onPress={() => setShowCreateBookModal(false)} hitSlop={8}><Feather name="x" size={24} color="#6B7280" /></Pressable>
            </View>
            
            <Text style={styles.createBookLabel}>Name</Text>
            <TextInput style={styles.createBookInput} placeholder={`Enter ${newBookType === "personal" ? "book" : "account"} name`} placeholderTextColor="#9CA3AF" value={newBookName} onChangeText={setNewBookName} />
            
            <Text style={styles.createBookLabel}>Description (Optional)</Text>
            <TextInput style={[styles.createBookInput, styles.createBookTextArea]} placeholder="Add a description" placeholderTextColor="#9CA3AF" value={newBookDescription} onChangeText={setNewBookDescription} multiline numberOfLines={3} />
            
            {newBookType === "business" && (
              <>
                <Text style={styles.createBookLabel}>Account Type</Text>
                <View style={styles.categoryPicker}>
                  {[
                    { id: "assets", name: "Assets", icon: "package" },
                    { id: "bank", name: "Bank Account", icon: "briefcase" },
                    { id: "credit-card", name: "Credit Card", icon: "credit-card" },
                    { id: "investment", name: "Investment", icon: "trending-up" }
                  ].map((cat) => (
                    <Pressable key={cat.id} onPress={() => setNewBookCategory(cat.id)} style={[styles.categoryOption, { backgroundColor: newBookCategory === cat.id ? '#3B82F6' : '#F3F4F6' }]}>
                      <Feather name={cat.icon as any} size={14} color={newBookCategory === cat.id ? '#FFF' : '#6B7280'} />
                      <Text style={[styles.categoryOptionText, { color: newBookCategory === cat.id ? '#FFF' : '#374151' }]}>{cat.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            
            <View style={styles.createBookActions}>
              <Pressable onPress={() => setShowCreateBookModal(false)} style={[styles.createBookCancel, { backgroundColor: '#F3F4F6' }]}><Text style={[styles.createBookCancelText, { color: '#6B7280' }]}>Cancel</Text></Pressable>
<Pressable 
  onPress={() => {
    console.log("🔵 Modal save button pressed");
    console.log("🔵 newBookType:", newBookType);
    console.log("🔵 newBookCategory:", newBookCategory);
    
    // Check if this is an ACCOUNT (business with category like bank, credit-card, investment, assets)
    if (newBookType === "business" && newBookCategory && newBookCategory !== "book") {
      console.log("🔵 Creating ACCOUNT");
      handleCreateAccount(); // Call account function
    } else if (newBookType === "business" && newBookCategory === "book") {
      console.log("🔵 Creating BOOK");
      handleCreateBook(); // Call book function
    } else {
      console.log("🔵 Creating PERSONAL BOOK");
      // Personal book - use the existing function
      handleCreateBook();
    }
  }} 
  style={[styles.createBookConfirm, { backgroundColor: '#3B82F6' }]}
>
  <Text style={styles.createBookConfirmText}>
    {newBookType === "business" && newBookCategory && newBookCategory !== "book" ? "Create Account" : "Create"}
  </Text>
</Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Book Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: '#111827' }]}>Delete Book</Text>
            <Text style={[styles.modalMessage, { color: '#6B7280' }]}>Are you sure you want to delete "{bookToDelete?.name}"? This action cannot be undone.</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowDeleteModal(false)} style={[styles.modalBtn, { backgroundColor: '#F3F4F6' }]}><Text style={[styles.modalBtnText, { color: '#6B7280' }]}>Cancel</Text></Pressable>
              <Pressable onPress={handleConfirmDelete} style={[styles.modalBtn, { backgroundColor: '#EF4444' }]}><Text style={[styles.modalBtnText, { color: "#FFF" }]}>Delete</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCannotDeleteModal} transparent animationType="fade" onRequestClose={() => setShowCannotDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: '#111827' }]}>Cannot Delete</Text>
            <Text style={[styles.modalMessage, { color: '#6B7280' }]}>Only the owner of this book can delete it.</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowCannotDeleteModal(false)} style={[styles.modalBtn, { backgroundColor: '#3B82F6' }]}><Text style={[styles.modalBtnText, { color: "#FFF" }]}>OK</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== BOOK DASHBOARD ====================
function BookDashboard() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const theme = isDark ? Colors.dark : Colors.light;
  const { activeBook, setActiveBook, transactions, deleteTransaction } = useApp();
  const { currentBookAccess, isBookRestricted } = useAuth();
  const [filter, setFilter] = useState<DashFilter>("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  
  const canEdit = !isBookRestricted || currentBookAccess?.accessLevel === "write";
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);
  
  const filtered = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    if (filter === "all") return transactions;
    return transactions.filter((t) => t?.type === filter);
  }, [transactions, filter]);

  const handleDelete = useCallback((tx: Transaction) => {
    if (!tx?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTxToDelete(tx);
    setShowDeleteModal(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (txToDelete?.id) deleteTransaction(txToDelete.id);
    setShowDeleteModal(false);
    setTxToDelete(null);
  }, [txToDelete, deleteTransaction]);

  const handleEdit = useCallback((tx: Transaction) => {
    if (!tx?.id) return;
    router.push({ pathname: "/add-transaction", params: { editId: tx.id } });
  }, []);

  if (!activeBook) return null;

  const totalIncome = transactions?.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0) || 0;
  const totalExpense = transactions?.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0) || 0;
  const balance = totalIncome - totalExpense;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: theme.border, backgroundColor: theme.background }]}>
        <Pressable onPress={() => setActiveBook(null)} hitSlop={8} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text, flex: 1, textAlign: "center" }]} numberOfLines={1}>{activeBook.name || "Book"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: theme.income + '15' }]}>
          <Text style={[styles.summaryLabel, { color: theme.income }]}>Income</Text>
          <Text style={[styles.summaryAmount, { color: theme.income }]}>{formatEGP(totalIncome)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.expense + '15' }]}>
          <Text style={[styles.summaryLabel, { color: theme.expense }]}>Expense</Text>
          <Text style={[styles.summaryAmount, { color: theme.expense }]}>{formatEGP(totalExpense)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.tint + '15' }]}>
          <Text style={[styles.summaryLabel, { color: theme.tint }]}>Balance</Text>
          <Text style={[styles.summaryAmount, { color: balance >= 0 ? theme.income : theme.expense }]}>{formatEGP(balance)}</Text>
        </View>
      </View>

      <View style={[styles.filterRow, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        {(["all", "income", "expense"] as DashFilter[]).map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterTab, filter === f && { borderBottomColor: theme.tint, borderBottomWidth: 2 }]}>
            <Text style={[styles.filterLabel, { color: filter === f ? theme.tint : theme.textSecondary }]}>
              {f === "all" ? "All" : f === "income" ? "Income" : "Expense"}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item?.id || Math.random().toString()}
        renderItem={({ item }) => <TxItem tx={item} theme={theme} onEdit={handleEdit} onDelete={handleDelete} canEdit={canEdit} />}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 100 }, (!filtered || filtered.length === 0) && styles.emptyContainer]}
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <Feather name="inbox" size={44} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No transactions found</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
      />

      <Pressable onPress={() => router.push("/add-transaction")} style={styles.fabButton}>
        <LinearGradient colors={['#3B82F6', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
          <Feather name="plus" size={24} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>

      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? "#0A1F15" : "#FFFFFF" }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Confirm Delete</Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>{txToDelete ? `Delete "${txToDelete.category}" — ${formatEGP(txToDelete.amount)}?` : "Delete this transaction?"}</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowDeleteModal(false)} style={[styles.modalBtn, { backgroundColor: theme.surface }]}><Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text></Pressable>
              <Pressable onPress={handleConfirmDelete} style={[styles.modalBtn, { backgroundColor: theme.expense }]}><Text style={[styles.modalBtnText, { color: "#FFF" }]}>Delete</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 4, width: 40 },
  title: { fontSize: 20 },
  addBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  filterTab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: "transparent" },
  filterLabel: { fontSize: 15 },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  emptyContainer: { flex: 1 },
  emptyContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyText: { fontSize: 15 },
  separator: { height: StyleSheet.hairlineWidth },
  txItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 12 },
  txIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txContent: { flex: 1 },
  txCatRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  txCat: { fontSize: 15, marginBottom: 3 },
  txMeta: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  txDate: { fontSize: 12 },
  txPayMode: { fontSize: 12, flexShrink: 1 },
  txNote: { fontSize: 12, flexShrink: 1 },
  txRight: { alignItems: "flex-end" },
  txAmt: { fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 32 },
  modalContent: { width: "100%", maxWidth: 340, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, marginBottom: 8 },
  modalMessage: { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  modalBtnText: { fontSize: 15 },
  scroll: { paddingHorizontal: 20, paddingBottom: 80 },
  summaryRow: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  summaryCard: { flex: 1, borderRadius: 16, padding: 12, alignItems: "center" },
  summaryLabel: { fontSize: 12, marginBottom: 4 },
  summaryAmount: { fontSize: 16 },
  headerRowNew: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginBottom: 20 },
  headerLogoSmall: { width: 100, height: 65 },
  selectorContainer: { flexDirection: "row", backgroundColor: "#F3F4F6", borderRadius: 30, padding: 4 },
  selectorOption: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 25 },
  selectorActive: { backgroundColor: "#3B82F6" },
  selectorText: { fontSize: 14, color: "#6B7280" },
  selectorTextActive: { color: "#FFFFFF" },
  notificationBtnSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  headerAvatarSmall: { width: 32, height: 32, borderRadius: 16 },
  greetingSectionNew: { marginBottom: 24 },
  greetingTextNew: { fontSize: 26, color: "#000000", fontWeight: "600" },
  userNameTextNew: { fontSize: 24, color: "#111827", fontWeight: "bold", marginTop: 2 },
  snapshotText: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  liquidCashCard: { borderRadius: 20, marginBottom: 20, overflow: 'hidden', minHeight: 200 },
  liquidCardGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  liquidCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20 },
  liquidCashLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, fontWeight: '600' },
  liquidCashAmount: { fontSize: 28, color: '#FFFFFF', fontWeight: 'bold', marginTop: 4 },
  liveChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  liveText: { fontSize: 11, color: '#FFFFFF', fontWeight: '600' },
// Add these to your existing styles object (around line where other styles are defined)
topNavbar: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  alignItems: 'center',
  paddingVertical: 12,
  backgroundColor: '#FFFFFF',
  borderBottomWidth: 1,
  borderBottomColor: '#E5E7EB',
  marginBottom: 16,
},
topNavItem: {
  alignItems: 'center',
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 8,
},
topNavItemActive: {
  backgroundColor: '#EFF6FF',
},
topNavLabel: {
  fontSize: 11,
  marginTop: 4,
  fontWeight: '500',
},
topNavLabelActive: {
  fontWeight: '600',
},
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, marginTop: 31 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },
  statAmount: { fontSize: 14, fontWeight: 'bold', marginTop: 2, color: '#FFFFFF' },
  safeSpendCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  safeSpendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  safeSpendLabel: { fontSize: 12, color: '#9CA3AF' },
  healthyChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  healthyText: { fontSize: 11, fontWeight: '600' },
  safeSpendAmount: { fontSize: 24, color: '#111827', fontWeight: 'bold', marginBottom: 16 },
  progressBarContainer: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBar: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 11, color: '#9CA3AF' },
// Add these styles to your styles object (around line where other styles are defined)
businessCapitalCard: {
  borderRadius: 20,
  marginBottom: 20,
  overflow: 'hidden',
  minHeight: 200,
},
quickActionsSection: {
  marginBottom: 24,
},
sectionTitle: {
  fontSize: 16,
  color: '#111827',
  fontWeight: '600',
  marginBottom: 12,
},
quickActionsRow: {
  flexDirection: 'row',
  gap: 16,
  justifyContent: 'space-between',
},
quickActionBtn: {
  flex: 1,
  alignItems: 'center',
},
quickActionIcon: {
  width: 56,
  height: 56,
  borderRadius: 28,
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 8,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 2,
},
quickActionLabel: {
  fontSize: 12,
  color: '#6B7280',
  fontWeight: '500',
},
accountSummarySection: {
  marginBottom: 24,
},
accountSummaryItem: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: 12,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: '#F0F0F0',
},
accountSummaryIcon: {
  width: 44,
  height: 44,
  borderRadius: 12,
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 12,
},
accountSummaryInfo: {
  flex: 1,
},
accountSummaryName: {
  fontSize: 14,
  color: '#111827',
  fontWeight: '600',
  marginBottom: 2,
},
accountSummaryCount: {
  fontSize: 12,
  color: '#9CA3AF',
},
  recentTransactionsSection: { marginTop: 8, marginBottom: 20 },
  recentTransactionsTitle: { fontSize: 16, color: '#111827', fontWeight: '600', marginBottom: 12 },
  noTransactionsCard: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 32, alignItems: 'center', gap: 12 },
  noTransactionsText: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  noTransactionsSubtext: { fontSize: 12, color: '#D1D5DB', textAlign: 'center' },
  recentTxItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginBottom: 8 },
  recentTxIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  recentTxInfo: { flex: 1 },
  recentTxCategory: { fontSize: 14, color: '#111827', fontWeight: '500', marginBottom: 2 },
  recentTxDate: { fontSize: 11, color: '#9CA3AF' },
  recentTxAmount: { fontSize: 14, fontWeight: '600' },
  businessStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  businessStatCardSmall: { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center' },
  businessStatEmoji: { fontSize: 24, marginBottom: 8 },
  businessStatLabelSmall: { fontSize: 10, color: '#6B7280', marginBottom: 4, textAlign: 'center' },
  businessStatAmountSmall: { fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  businessHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  businessTitle: { fontSize: 20, color: '#111827', fontWeight: 'bold' },
  businessHeaderButtons: { flexDirection: 'row', gap: 10 },
  businessAddAccountBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 },
  businessAddAccountText: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },
  businessAddTransBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 },
  businessAddTransText: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  accountCategorySection: { marginBottom: 24 },
  accountCategoryTitle: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 12, letterSpacing: 0.5 },
  accountCardsContainer: { gap: 10 },
  accountCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: '#F0F0F0' },
  accountCardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  accountCardInfo: { flex: 1 },
  accountCardName: { fontSize: 15, color: '#111827', fontWeight: '600', marginBottom: 4 },
  accountCardChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, gap: 4 },
  linkedChip: { backgroundColor: '#10B98120' },
  businessChip: { backgroundColor: '#F59E0B20' },
  chipTextLinked: { fontSize: 9, color: '#10B981', fontWeight: '500' },
  chipTextBusiness: { fontSize: 9, color: '#F59E0B', fontWeight: '500' },
  accountCardBalance: { fontSize: 15, fontWeight: 'bold' },
  emptyBusinessState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 16 },
  emptyBusinessTitle: { fontSize: 18, color: '#111827', fontWeight: '600', textAlign: 'center' },
  emptyBusinessText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  emptyBusinessBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  emptyBusinessBtnText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  personalFabButton: { position: 'absolute', bottom: 80, right: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
  personalFabGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fabButton: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
  fabGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  createBookModal: { width: "90%", maxWidth: 400, borderRadius: 24, padding: 24 },
  createBookModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
// Add to your styles object:
topNavbar: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  alignItems: 'center',
  paddingVertical: 12,
  backgroundColor: '#FFFFFF',
  borderBottomWidth: 1,
  borderBottomColor: '#E5E7EB',
  marginBottom: 16,
},
topNavItem: {
  alignItems: 'center',
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: 8,
},
topNavItemActive: {
  backgroundColor: '#EFF6FF',
},
topNavLabel: {
  fontSize: 11,
  marginTop: 4,
  color: '#6B7280',
  fontWeight: '500',
},
topNavLabelActive: {
  color: '#3B82F6',
  fontWeight: '600',
},
  createBookModalTitle: { fontSize: 20, color: '#111827', fontWeight: 'bold' },
  createBookLabel: { fontSize: 14, color: '#374151', fontWeight: '600', marginBottom: 8 },
  createBookInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 16 },
  createBookTextArea: { minHeight: 80, textAlignVertical: 'top' },
  categoryPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  categoryOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  categoryOptionText: { fontSize: 12, fontWeight: '500' },
  createBookActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  createBookCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  createBookCancelText: { fontSize: 16, fontWeight: '600' },
  createBookConfirm: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  createBookConfirmText: { fontSize: 16, color: '#FFF', fontWeight: '600' },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: -25, marginLeft: -20 },
  headerLogo: { width: 160, height: 160, resizeMode: 'contain' },
  notificationBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: '#F3F4F6', position: 'relative' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, resizeMode: "cover" },
  restrictedBookContainer: { padding: 20 },
  restrictedBookHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, padding: 16, backgroundColor: '#EFF6FF', borderRadius: 16 },
  restrictedBookTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', flex: 1 },
  accessBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  accessBadgeText: { fontSize: 11, fontWeight: '500' },
  profileModalContent: { borderRadius: 24, padding: 24, maxHeight: "80%" },
  profileModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  profileModalTitle: { fontSize: 20 },
  profileUserSection: { alignItems: "center", marginBottom: 24, position: 'relative' },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  profileAvatarImage: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  editPhotoBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#3B82F6', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  profileEmail: { fontSize: 14, marginBottom: 8 },
  profileInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  profileInfoLabel: { fontSize: 14, flex: 1 },
  profileInfoValue: { fontSize: 14, flex: 2, textAlign: "right" },
  profileEditBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, marginTop: 16 },
  profileEditBtnText: { fontSize: 16, fontWeight: '600' },
  profileDivider: { height: 1, marginVertical: 20 },
  profileDeleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  profileDeleteText: { fontSize: 16 },
  profileLogoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  profileLogoutText: { fontSize: 16 },
// Add to styles object
docsHeaderRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 24,
},
docsHeaderLogo: {
  width: 80,
  height: 52,
},
docsTitleSection: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 20,
},
docsHubTitle: {
  fontSize: 24,
  color: "#111827",
  fontWeight: "bold",
},
docsHubSubtitle: {
  fontSize: 13,
  color: "#9CA3AF",
  marginTop: 4,
},
createDocBtn: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#3B82F6",
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 30,
  gap: 8,
},
createDocBtnText: {
  fontSize: 14,
  color: "#FFFFFF",
  fontWeight: "600",
},
docsFilterScroll: {
  flexGrow: 0,
  marginBottom: 20,
},
docsFilterChip: {
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 20,
  backgroundColor: "#F3F4F6",
  marginRight: 10,
},
docsFilterChipActive: {
  backgroundColor: "#3B82F6",
},
docsFilterChipText: {
  fontSize: 14,
  color: "#6B7280",
  fontWeight: "500",
},
docsFilterChipTextActive: {
  color: "#FFFFFF",
},
docsStatsScroll: {
  flexGrow: 0,
  marginBottom: 24,
},
docsStatCard: {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  padding: 14,
  alignItems: "center",
  width: 90,
  marginRight: 12,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
  borderWidth: 1,
  borderColor: "#F0F0F0",
},
docsStatIconCircle: {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 8,
},
docsStatType: {
  fontSize: 12,
  color: "#6B7280",
  fontWeight: "500",
  marginBottom: 4,
},
docsStatCount: {
  fontSize: 18,
  fontWeight: "bold",
},
docsEmptyState: {
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 60,
  gap: 16,
},
docsEmptyTitle: {
  fontSize: 18,
  color: "#111827",
  fontWeight: "600",
},
docsEmptyText: {
  fontSize: 14,
  color: "#9CA3AF",
  textAlign: "center",
},
docsEmptyBtn: {
  backgroundColor: "#3B82F6",
  paddingHorizontal: 24,
  paddingVertical: 12,
  borderRadius: 12,
  marginTop: 8,
},
docsEmptyBtnText: {
  fontSize: 14,
  color: "#FFFFFF",
  fontWeight: "600",
},
docsList: {
  gap: 12,
  marginBottom: 20,
},
docCard: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  padding: 14,
  borderWidth: 1,
  borderColor: "#F0F0F0",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
},
docCardContent: {
  flex: 1,
  marginLeft: 12,
},
docCardNumber: {
  fontSize: 14,
  fontWeight: "600",
  color: "#111827",
  marginBottom: 2,
},
docCardParty: {
  fontSize: 12,
  color: "#6B7280",
},
docCardBadgeContainer: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
},
docDownloadBtn: {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: "#EFF6FF",
  alignItems: "center",
  justifyContent: "center",
},
docIconCircle: {
  alignItems: "center",
  justifyContent: "center",
},
typeBadge: {
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: 12,
},
typeBadgeText: {
  fontSize: 10,
  fontWeight: "600",
},
downloadPdfBtn: {
  marginTop: 16,
  borderRadius: 12,
  overflow: "hidden",
},
downloadPdfGradient: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  paddingVertical: 12,
},
downloadPdfText: {
  color: "#FFF",
  fontSize: 14,
  fontWeight: "600",
},
// Modal styles
modalContainer: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.5)",
  justifyContent: "center",
  alignItems: "center",
},
modalContentFull: {
  width: "90%",
  maxHeight: "85%",
  borderRadius: 24,
  padding: 20,
},
modalHeader: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
},
modalTitle: {
  fontSize: 20,
  fontWeight: "bold",
  color: "#000",
},
aiGenerateOption: {
  backgroundColor: "#F3E8FF",
  borderRadius: 16,
  marginBottom: 24,
  borderWidth: 1,
  borderColor: "#E9D5FF",
},
aiContent: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  padding: 20,
},
aiTitle: {
  fontSize: 18,
  fontWeight: "bold",
  color: "#8B5CF6",
},
aiSubtitle: {
  fontSize: 12,
  color: "#6B7280",
  marginTop: 4,
},
aiRobotIcon: {
  width: 60,
  height: 60,
  alignItems: "center",
  justifyContent: "center",
},
aiRobotImage: {
  width: 60,
  height: 60,
},
divider: {
  flexDirection: "row",
  alignItems: "center",
  marginVertical: 16,
},
dividerLine: {
  flex: 1,
  height: 1,
},
dividerText: {
  fontSize: 12,
  marginHorizontal: 12,
  fontWeight: "500",
},
typeOptionRow: {
  flexDirection: "row",
  alignItems: "center",
  padding: 16,
  backgroundColor: "#F9FAFB",
  borderRadius: 12,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: "#F0F0F0",
},
typeOptionIconRow: {
  width: 48,
  height: 48,
  borderRadius: 24,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 16,
},
typeOptionTextRow: {
  flex: 1,
  fontSize: 16,
  fontWeight: "500",
  color: "#000",
},
// Document Hub Styles - Add to your styles object
docsTitleSection: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 20,
  marginTop: 8,
},
docsHubTitle: {
  fontSize: 24,
  color: "#111827",
  fontWeight: "bold",
  fontFamily: "Inter_700Bold",
},
docsHubSubtitle: {
  fontSize: 13,
  color: "#9CA3AF",
  marginTop: 4,
  fontFamily: "Inter_400Regular",
},
createDocBtn: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#3B82F6",
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 30,
  gap: 8,
},
createDocBtnText: {
  fontSize: 14,
  color: "#FFFFFF",
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
docsFilterScroll: {
  flexGrow: 0,
  marginBottom: 20,
},
docsFilterChip: {
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 20,
  backgroundColor: "#F3F4F6",
  marginRight: 10,
},
docsFilterChipActive: {
  backgroundColor: "#3B82F6",
},
docsFilterChipText: {
  fontSize: 14,
  color: "#6B7280",
  fontWeight: "500",
  fontFamily: "Inter_500Medium",
},
docsFilterChipTextActive: {
  color: "#FFFFFF",
},
docsStatsScroll: {
  flexGrow: 0,
  marginBottom: 24,
},
docStatCard: {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  padding: 14,
  alignItems: "center",
  width: 90,
  marginRight: 12,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
  borderWidth: 1,
  borderColor: "#F0F0F0",
},
docStatIconCircle: {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 8,
},
docStatType: {
  fontSize: 12,
  color: "#6B7280",
  fontWeight: "500",
  marginBottom: 4,
  fontFamily: "Inter_500Medium",
},
docStatCount: {
  fontSize: 18,
  fontWeight: "bold",
  fontFamily: "Inter_700Bold",
},
docsEmptyState: {
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 60,
  gap: 16,
},
docsEmptyTitle: {
  fontSize: 18,
  color: "#111827",
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
docsEmptyText: {
  fontSize: 14,
  color: "#9CA3AF",
  textAlign: "center",
  fontFamily: "Inter_400Regular",
},
docsEmptyBtn: {
  backgroundColor: "#3B82F6",
  paddingHorizontal: 24,
  paddingVertical: 12,
  borderRadius: 12,
  marginTop: 8,
},
docsEmptyBtnText: {
  fontSize: 14,
  color: "#FFFFFF",
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
docsList: {
  gap: 12,
  marginBottom: 20,
},
docCard: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  padding: 14,
  borderWidth: 1,
  borderColor: "#F0F0F0",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
},
docCardContent: {
  flex: 1,
  marginLeft: 12,
},
docCardNumber: {
  fontSize: 14,
  fontWeight: "600",
  color: "#111827",
  marginBottom: 2,
  fontFamily: "Inter_600SemiBold",
},
docCardParty: {
  fontSize: 12,
  color: "#6B7280",
  fontFamily: "Inter_400Regular",
},
docCardBadgeContainer: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
},
docDownloadBtn: {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: "#EFF6FF",
  alignItems: "center",
  justifyContent: "center",
},
docIconCircle: {
  alignItems: "center",
  justifyContent: "center",
},
typeBadge: {
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: 12,
},
typeBadgeText: {
  fontSize: 10,
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
downloadPdfBtn: {
  marginTop: 16,
  borderRadius: 12,
  overflow: "hidden",
},
downloadPdfGradient: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  paddingVertical: 12,
},
downloadPdfText: {
  color: "#FFF",
  fontSize: 14,
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
// Modal styles (if not already present)
modalContainer: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.5)",
  justifyContent: "center",
  alignItems: "center",
},
modalContentFull: {
  width: "90%",
  maxHeight: "85%",
  borderRadius: 24,
  padding: 20,
},
modalHeader: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
},
modalTitle: {
  fontSize: 20,
  fontWeight: "bold",
  color: "#000",
  fontFamily: "Inter_700Bold",
},
aiGenerateOption: {
  backgroundColor: "#F3E8FF",
  borderRadius: 16,
  marginBottom: 24,
  borderWidth: 1,
  borderColor: "#E9D5FF",
},
aiContent: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  padding: 20,
},
aiTitle: {
  fontSize: 18,
  fontWeight: "bold",
  color: "#8B5CF6",
  fontFamily: "Inter_700Bold",
},
// Report styles
reportActionRow: {
  flexDirection: "row",
  gap: 12,
  marginBottom: 20,
  flexWrap: "wrap",
},
reportActionChip: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 30,
  borderWidth: 1,
  borderColor: "#3B82F6",
  backgroundColor: "#FFFFFF",
},
reportActionChipPrimary: {
  backgroundColor: "#3B82F6",
  borderColor: "#3B82F6",
},
reportActionText: {
  fontSize: 14,
  color: "#3B82F6",
  fontWeight: "500",
},
reportExportCounter: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  backgroundColor: "#F3F4F6",
  padding: 12,
  borderRadius: 12,
  marginBottom: 20,
},
reportExportText: {
  fontSize: 13,
  color: "#6B7280",
},
reportExportBtn: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  backgroundColor: "#3B82F6",
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 20,
},
reportExportBtnText: {
  fontSize: 12,
  color: "#FFFFFF",
  fontWeight: "500",
},
reportCardsGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 12,
  marginBottom: 20,
},
reportCard: {
  flex: 1,
  minWidth: "48%",
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  padding: 14,
  borderWidth: 1,
  borderColor: "#F0F0F0",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
},
reportCardHeader: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
},
reportCardIcon: {
  width: 36,
  height: 36,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
},
reportCardName: {
  flex: 1,
  fontSize: 14,
  fontWeight: "600",
  color: "#111827",
},
reportCheckbox: {
  width: 22,
  height: 22,
  borderRadius: 6,
  borderWidth: 2,
  borderColor: "#D1D5DB",
  alignItems: "center",
  justifyContent: "center",
},
reportCheckboxSelected: {
  backgroundColor: "#3B82F6",
  borderColor: "#3B82F6",
},
reportCardPreview: {
  marginTop: 10,
  paddingTop: 10,
  borderTopWidth: 1,
  borderTopColor: "#F0F0F0",
},
reportCardPreviewText: {
  fontSize: 11,
  color: "#9CA3AF",
},
previewStatsGrid: {
  flexDirection: "row",
  gap: 12,
  marginBottom: 20,
},
previewStatCard: {
  flex: 1,
  backgroundColor: "#F9FAFB",
  borderRadius: 12,
  padding: 12,
  alignItems: "center",
},
previewStatLabel: {
  fontSize: 11,
  color: "#6B7280",
  marginBottom: 4,
},
previewStatValue: {
  fontSize: 16,
  fontWeight: "bold",
},
previewRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 12,
  borderBottomWidth: 1,
  borderBottomColor: "#F0F0F0",
},
previewLabel: {
  fontSize: 14,
  color: "#111827",
  fontWeight: "500",
},
previewValue: {
  fontSize: 14,
  fontWeight: "600",
},
previewDate: {
  fontSize: 11,
  color: "#9CA3AF",
  marginTop: 2,
},
previewCashFlowValues: {
  flexDirection: "row",
  gap: 12,
},
previewExportBtn: {
  marginTop: 20,
  borderRadius: 12,
  overflow: "hidden",
},
previewExportGradient: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  paddingVertical: 12,
},
previewExportText: {
  color: "#FFF",
  fontSize: 14,
  fontWeight: "600",
},
previewComingSoon: {
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 60,
  gap: 12,
},
previewComingSoonText: {
  fontSize: 18,
  fontWeight: "600",
  color: "#111827",
},
previewComingSoonSubtext: {
  fontSize: 14,
  color: "#9CA3AF",
  textAlign: "center",
},
docCardBook: {
  fontSize: 10,
  color: "#9CA3AF",
  marginTop: 2,
  fontFamily: "Inter_400Regular",
},
aiSubtitle: {
  fontSize: 12,
  color: "#6B7280",
  marginTop: 4,
  fontFamily: "Inter_400Regular",
},
aiRobotIcon: {
  width: 60,
  height: 60,
  alignItems: "center",
  justifyContent: "center",
},
aiRobotImage: {
  width: 60,
  height: 60,
},
divider: {
  flexDirection: "row",
  alignItems: "center",
  marginVertical: 16,
},
dividerLine: {
  flex: 1,
  height: 1,
},
dividerText: {
  fontSize: 12,
  marginHorizontal: 12,
  fontWeight: "500",
  fontFamily: "Inter_500Medium",
},
typeOptionRow: {
  flexDirection: "row",
  alignItems: "center",
  padding: 16,
  backgroundColor: "#F9FAFB",
  borderRadius: 12,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: "#F0F0F0",
},
typeOptionIconRow: {
  width: 48,
  height: 48,
  borderRadius: 24,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 16,
},
typeOptionTextRow: {
  flex: 1,
  fontSize: 16,
  fontWeight: "500",
  color: "#000",
  fontFamily: "Inter_500Medium",
},
detailStatusBadge: {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "flex-start",
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 20,
  marginBottom: 16,
  gap: 6,
},
detailStatusDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},
detailStatusText: {
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
detailNumber: {
  fontSize: 14,
  color: "#6B7280",
  marginBottom: 16,
  fontFamily: "Inter_400Regular",
},
detailRow: {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: 16,
  flexWrap: "wrap",
},
detailLabel: {
  fontSize: 14,
  color: "#6B7280",
  marginLeft: 8,
  flex: 1,
  fontFamily: "Inter_400Regular",
},
detailValue: {
  fontSize: 14,
  color: "#000",
  fontWeight: "500",
  fontFamily: "Inter_500Medium",
},
detailAmount: {
  fontSize: 18,
  fontWeight: "bold",
  fontFamily: "Inter_700Bold",
},
detailStatusBadge: {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "flex-start",
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 20,
  marginBottom: 16,
  gap: 6,
},
detailStatusDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},
detailStatusText: {
  fontSize: 12,
  fontWeight: "600",
},
detailNumber: {
  fontSize: 14,
  color: "#6B7280",
  marginBottom: 16,
},
detailRow: {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: 16,
  flexWrap: "wrap",
},
detailLabel: {
  fontSize: 14,
  color: "#6B7280",
  marginLeft: 8,
  flex: 1,
},
detailValue: {
  fontSize: 14,
  color: "#000",
  fontWeight: "500",
},
detailAmount: {
  fontSize: 18,
  fontWeight: "bold",
},
// Add these to your styles object
bottomTabBar: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  alignItems: 'center',
  paddingTop: 8,
  paddingBottom: 8,
  borderTopWidth: 1,
  borderTopColor: '#E5E7EB',
  backgroundColor: '#FFFFFF',
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1000,
},
bottomTabItem: {
  alignItems: 'center',
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: 8,
  minWidth: 60,
},
bottomTabItemActive: {
  // backgroundColor: '#EFF6FF', // Optional: add background for active tab
},
bottomTabLabel: {
  fontSize: 11,
  marginTop: 4,
  fontWeight: '500',
},
bottomTabLabelActive: {
  fontWeight: '600',
},
// Client Card Styles
clientCard: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  padding: 14,
  borderWidth: 1,
  borderColor: "#F0F0F0",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
  marginBottom: 12,
},
clientCardIcon: {
  width: 48,
  height: 48,
  borderRadius: 24,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 14,
},
clientCardInfo: {
  flex: 1,
},
clientCardName: {
  fontSize: 15,
  fontWeight: "600",
  color: "#111827",
  marginBottom: 2,
  fontFamily: "Inter_600SemiBold",
},
clientCardCompany: {
  fontSize: 12,
  color: "#6B7280",
  marginBottom: 4,
  fontFamily: "Inter_400Regular",
},
clientCardChips: {
  flexDirection: "row",
  gap: 6,
},
clientStatusChip: {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: 12,
},
clientStatusDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
},
clientStatusText: {
  fontSize: 9,
  fontWeight: "500",
  fontFamily: "Inter_500Medium",
},
clientCurrencyChip: {
  backgroundColor: "#F3F4F6",
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: 12,
},
clientCurrencyText: {
  fontSize: 9,
  fontWeight: "500",
  color: "#6B7280",
  fontFamily: "Inter_500Medium",
},
clientCardActions: {
  flexDirection: "row",
  gap: 8,
},
clientActionBtn: {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: "#F9FAFB",
  alignItems: "center",
  justifyContent: "center",
},
// Client Detail Styles
clientDetailStatus: {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "flex-start",
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 20,
  marginBottom: 16,
  gap: 6,
},
clientDetailStatusDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},
clientDetailStatusText: {
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
clientDetailName: {
  fontSize: 20,
  fontWeight: "bold",
  color: "#111827",
  marginBottom: 16,
  fontFamily: "Inter_700Bold",
},
goalCompletedBadge: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  marginTop: 8,
  paddingVertical: 4,
  paddingHorizontal: 10,
  backgroundColor: '#10B98120',
  borderRadius: 12,
  alignSelf: 'flex-start',
},
goalCompletedText: {
  fontSize: 12,
  color: '#10B981',
  fontFamily: 'Inter_600SemiBold',
},
// Form Styles
formLabel: {
  fontSize: 14,
  fontWeight: "600",
  color: "#374151",
  marginBottom: 8,
  marginTop: 12,
  fontFamily: "Inter_600SemiBold",
},
formInput: {
  borderWidth: 1,
  borderColor: "#E5E7EB",
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 12,
  fontSize: 15,
  color: "#111827",
  backgroundColor: "#FFFFFF",
  fontFamily: "Inter_400Regular",
  marginBottom: 8,
},
formTextArea: {
  minHeight: 80,
  textAlignVertical: "top",
},
pickerScroll: {
  flexGrow: 0,
  marginBottom: 8,
},
pickerOption: {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 20,
  backgroundColor: "#F3F4F6",
  marginRight: 10,
},
pickerOptionActive: {
  backgroundColor: "#3B82F6",
},
// Add these to your styles object
searchContainer: {
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  marginBottom: 20,
},
// ==================== BUDGET STYLES ====================
budgetStatsCard: {
  flexDirection: "row",
  backgroundColor: "#3B82F6",
  borderRadius: 20,
  padding: 20,
  marginBottom: 20,
  justifyContent: "space-between",
  alignItems: "center",
},
budgetStatsLeft: { flex: 1 },
budgetStatsLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4, fontFamily: "Inter_500Medium" },
budgetStatsAmount: { fontSize: 24, color: "#FFFFFF", fontWeight: "bold", marginBottom: 12, fontFamily: "Inter_700Bold" },
budgetStatsDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 8 },
budgetStatsSubLabel: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2, fontFamily: "Inter_400Regular" },
budgetStatsSubAmount: { fontSize: 16, color: "#FFFFFF", fontWeight: "600", fontFamily: "Inter_600SemiBold" },
budgetRingChart: { width: 100, height: 100, alignItems: "center", justifyContent: "center", position: "relative" },
ringChartCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
ringChartPercent: { fontSize: 18, fontWeight: "bold", color: "#FFFFFF", fontFamily: "Inter_700Bold" },
ringChartLabel: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
budgetOverviewCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
budgetOverviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
budgetOverviewTitle: { fontSize: 16, color: "#111827", fontWeight: "600", fontFamily: "Inter_600SemiBold" },
budgetItem: { marginBottom: 16 },
budgetItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
budgetItemLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
budgetItemIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
budgetItemName: { fontSize: 14, color: "#111827", fontWeight: "500", fontFamily: "Inter_500Medium", marginBottom: 2 },
budgetItemSpent: { fontSize: 11, color: "#9CA3AF", fontFamily: "Inter_400Regular" },
budgetItemPercent: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
budgetProgressBar: { height: 6, backgroundColor: "#F3F4F6", borderRadius: 3, overflow: "hidden" },
budgetProgressFill: { height: "100%", borderRadius: 3 },
budgetModalLabel: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8, marginTop: 16, fontFamily: "Inter_600SemiBold" },
budgetCategoryScroll: { flexGrow: 0, marginBottom: 8 },
budgetCategoryOption: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#F3F4F6", marginRight: 10 },
budgetCategoryOptionActive: { backgroundColor: "#3B82F6" },
budgetCategoryIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
budgetCategoryText: { fontSize: 13, color: "#374151", fontWeight: "500", fontFamily: "Inter_500Medium" },
budgetCategoryTextActive: { color: "#FFFFFF" },
budgetAmountInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: "#111827", backgroundColor: "#F9FAFB", fontFamily: "Inter_400Regular" },
emptyBudgetsState: { alignItems: "center", paddingVertical: 40, gap: 12 },
emptyBudgetsText: { fontSize: 14, color: "#6B7280", fontWeight: "500", fontFamily: "Inter_500Medium" },
emptyBudgetsSubtext: { fontSize: 12, color: "#9CA3AF", textAlign: "center", fontFamily: "Inter_400Regular" },

// ==================== GOAL STYLES ====================
goalsStatsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
goalStatCard: { flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
goalStatCardLeft: { backgroundColor: "#10B981" },
goalStatCardRight: { backgroundColor: "#059669" },
goalStatIcon: { marginBottom: 8, opacity: 0.9 },
goalStatLabel: { fontSize: 10, color: "rgba(255,255,255,0.75)", marginBottom: 4, fontFamily: "Inter_500Medium", letterSpacing: 0.3, textTransform: "uppercase" },
goalStatAmount: { fontSize: 20, color: "#FFFFFF", fontWeight: "bold", fontFamily: "Inter_700Bold" },
goalTabsContainer: { flexDirection: "row", backgroundColor: "#F3F4F6", borderRadius: 10, padding: 3, marginBottom: 20 },
goalTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
goalTabActive: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
goalTabText: { fontSize: 12, color: "#6B7280", fontWeight: "500", fontFamily: "Inter_500Medium" },
goalTabTextActive: { color: "#10B981", fontWeight: "600" },
goalsList: { gap: 10, marginBottom: 80 },
goalCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#F0F0F0", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
goalCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
goalCardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 12 },
goalCardInfo: { flex: 1 },
goalCardName: { fontSize: 14, color: "#111827", fontWeight: "600", marginBottom: 3, fontFamily: "Inter_600SemiBold" },
goalCardAmount: { fontSize: 11, color: "#6B7280", fontFamily: "Inter_400Regular" },
goalCardDeadline: { fontSize: 9, color: "#9CA3AF", marginTop: 2, fontFamily: "Inter_400Regular", flexDirection: "row", alignItems: "center", gap: 3 },
goalProgressChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
goalProgressText: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
goalProgressBar: { height: 4, backgroundColor: "#F3F4F6", borderRadius: 2, overflow: "hidden" },
goalProgressFill: { height: "100%", borderRadius: 2 },
goalFabButton: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, overflow: "hidden", shadowColor: "#3B82F6", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
goalFabGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
goalModalLabel: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8, marginTop: 16, fontFamily: "Inter_600SemiBold" },
goalModalInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: "#111827", backgroundColor: "#F9FAFB", fontFamily: "Inter_400Regular" },
goalIconScroll: { flexGrow: 0, marginBottom: 8 },
goalIconOption: { alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: "#F3F4F6", marginRight: 10, gap: 6 },
goalIconOptionActive: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#3B82F6" },
goalIconText: { fontSize: 11, color: "#6B7280", fontFamily: "Inter_400Regular" },
goalIconTextActive: { color: "#3B82F6", fontWeight: "500" },
searchBar: {
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#F9FAFB",
  borderRadius: 30,
  paddingHorizontal: 16,
  paddingVertical: 12,
  gap: 10,
  borderWidth: 1,
  borderColor: "#E5E7EB",
},
searchInput: {
  flex: 1,
  fontSize: 15,
  color: "#111827",
  fontFamily: "Inter_400Regular",
  padding: 0,
},
// Add these to your styles object
filterModalLabel: {
  fontSize: 14,
  color: '#374151',
  marginBottom: 10,
  marginTop: 16,
  fontFamily: "Inter_600SemiBold",
},
filterTypeRow: {
  flexDirection: 'row',
  gap: 10,
  flexWrap: 'wrap',
},
filterTypeChip: {
  paddingHorizontal: 20,
  paddingVertical: 10,
  borderRadius: 20,
  backgroundColor: '#F3F4F6',
  borderWidth: 1,
  borderColor: 'transparent',
},
filterTypeChipActive: {
  backgroundColor: '#3B82F6',
  borderColor: '#3B82F6',
},
filterTypeChipActiveIncome: {
  backgroundColor: '#10B981',
  borderColor: '#10B981',
},
filterTypeChipActiveExpense: {
  backgroundColor: '#EF4444',
  borderColor: '#EF4444',
},
filterTypeText: {
  fontSize: 14,
  color: '#6B7280',
  fontFamily: "Inter_500Medium",
},
filterTypeTextActive: {
  color: '#FFFFFF',
},
filterSortRow: {
  flexDirection: 'row',
  gap: 10,
  flexWrap: 'wrap',
},
filterSortChip: {
  paddingHorizontal: 20,
  paddingVertical: 10,
  borderRadius: 20,
  backgroundColor: '#F3F4F6',
  borderWidth: 1,
  borderColor: 'transparent',
},
filterSortChipActive: {
  backgroundColor: '#3B82F6',
  borderColor: '#3B82F6',
},
filterSortText: {
  fontSize: 14,
  color: '#6B7280',
  fontFamily: "Inter_500Medium",
},
filterSortTextActive: {
  color: '#FFFFFF',
},
filterModalActions: {
  flexDirection: 'row',
  gap: 12,
  marginTop: 24,
},
filterModalBtn: {
  flex: 1,
  paddingVertical: 14,
  borderRadius: 12,
  alignItems: 'center',
},
filterModalBtnText: {
  fontSize: 16,
  fontWeight: '600',
  fontFamily: "Inter_600SemiBold",
},
filterIconBtn: {
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: "#EFF6FF",
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: "#DBEAFE",
},
filterRowContainer: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
  flexWrap: "wrap",
  gap: 12,
},
typeFilterGroup: {
  flexDirection: "row",
  gap: 8,
},
typeFilterChip: {
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 20,
  backgroundColor: "#F3F4F6",
},
typeFilterChipActive: {
  backgroundColor: "#3B82F6",
},
typeFilterChipActiveIncome: {
  backgroundColor: "#10B981",
},
typeFilterChipActiveExpense: {
  backgroundColor: "#EF4444",
},
typeFilterText: {
  fontSize: 13,
  color: "#6B7280",
  fontWeight: "500",
  fontFamily: "Inter_500Medium",
},
typeFilterTextActive: {
  color: "#FFFFFF",
},
dateSortGroup: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#F9FAFB",
  borderRadius: 20,
  paddingHorizontal: 12,
  paddingVertical: 6,
  gap: 8,
  borderWidth: 1,
  borderColor: "#E5E7EB",
},
dateSortLabel: {
  fontSize: 12,
  color: "#9CA3AF",
  fontFamily: "Inter_400Regular",
},
dateSortOption: {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  paddingVertical: 4,
  paddingHorizontal: 8,
  borderRadius: 14,
},
dateSortText: {
  fontSize: 12,
  color: "#6B7280",
  fontFamily: "Inter_500Medium",
},
dateSortTextActive: {
  color: "#3B82F6",
  fontWeight: "600",
},
dateDivider: {
  width: 1,
  height: 16,
  backgroundColor: "#E5E7EB",
},
statsCard: {
  flexDirection: "row",
  backgroundColor: "#3B82F6",
  borderRadius: 20,
  padding: 20,
  marginBottom: 24,
  shadowColor: "#3B82F6",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.2,
  shadowRadius: 8,
  elevation: 5,
},
statsCardLeft: {
  flex: 1,
  alignItems: "flex-start",
},
statsCardRight: {
  flex: 1,
  alignItems: "flex-end",
},
statsDivider: {
  width: 1,
  backgroundColor: "rgba(255,255,255,0.3)",
  marginHorizontal: 16,
},
statsCardLabel: {
  fontSize: 12,
  color: "rgba(255,255,255,0.7)",
  fontFamily: "Inter_500Medium",
  marginBottom: 8,
},
statsCardAmount: {
  fontSize: 20,
  color: "#FFFFFF",
  fontWeight: "bold",
  fontFamily: "Inter_700Bold",
  marginBottom: 8,
},
statsCardTrend: {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  backgroundColor: "rgba(255,255,255,0.15)",
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 12,
},
statsCardPercent: {
  fontSize: 11,
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
statsCardVs: {
  fontSize: 10,
  color: "rgba(255,255,255,0.6)",
  fontFamily: "Inter_400Regular",
},
transactionsList: {
  gap: 10,
  marginBottom: 20,
},
recentTxNote: {
  fontSize: 11,
  color: "#9CA3AF",
  marginTop: 2,
  fontFamily: "Inter_400Regular",
},
pickerOptionText: {
  fontSize: 13,
  fontWeight: "500",
  color: "#374151",
  fontFamily: "Inter_500Medium",
},
pickerOptionTextActive: {
  color: "#FFFFFF",
},
statusPickerRow: {
  flexDirection: "row",
  gap: 12,
  marginBottom: 8,
},
// Add these styles to your styles object
bookContainer: {
  marginBottom: 12,
},
expandedTransactionsContainer: {
  backgroundColor: '#F9FAFB',
  borderRadius: 12,
  padding: 12,
  marginTop: 4,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: '#E5E7EB',
},
expandedHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
},
expandedTitle: {
  fontSize: 14,
  color: '#111827',
  fontWeight: '600',
  fontFamily: 'Inter_600SemiBold',
},
expandedAddBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#3B82F6',
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 16,
  gap: 4,
},
expandedAddBtnText: {
  fontSize: 12,
  color: '#FFFFFF',
  fontWeight: '500',
  fontFamily: 'Inter_500Medium',
},
expandedTxItem: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FFFFFF',
  borderRadius: 10,
  padding: 10,
  marginBottom: 6,
  borderWidth: 1,
  borderColor: '#F0F0F0',
},
expandedTxIcon: {
  width: 32,
  height: 32,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 10,
},
expandedTxInfo: {
  flex: 1,
},
expandedTxCategory: {
  fontSize: 13,
  color: '#111827',
  fontWeight: '500',
  fontFamily: 'Inter_500Medium',
},
expandedTxDate: {
  fontSize: 10,
  color: '#9CA3AF',
  fontFamily: 'Inter_400Regular',
},
expandedTxAmount: {
  fontSize: 13,
  fontWeight: '600',
  fontFamily: 'Inter_600SemiBold',
},
emptyTransactionsState: {
  alignItems: 'center',
  paddingVertical: 20,
  gap: 8,
},
emptyTransactionsText: {
  fontSize: 13,
  color: '#9CA3AF',
  fontFamily: 'Inter_400Regular',
},
emptyAddBtn: {
  paddingVertical: 6,
  paddingHorizontal: 16,
},
emptyAddBtnText: {
  fontSize: 13,
  color: '#3B82F6',
  fontWeight: '500',
  fontFamily: 'Inter_500Medium',
},
viewAllBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  paddingVertical: 8,
  marginTop: 4,
},
viewAllBtnText: {
  fontSize: 13,
  color: '#3B82F6',
  fontWeight: '500',
  fontFamily: 'Inter_500Medium',
},
statusOption: {
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  paddingVertical: 12,
  borderRadius: 12,
  backgroundColor: "#F3F4F6",
},
statusOptionActive: {
  backgroundColor: "#10B98120",
  borderWidth: 1,
  borderColor: "#10B981",
},
statusOptionActiveInactive: {
  backgroundColor: "#EF444420",
  borderWidth: 1,
  borderColor: "#EF4444",
},
statusOptionText: {
  fontSize: 14,
  fontWeight: "500",
  color: "#6B7280",
  fontFamily: "Inter_500Medium",
},
statusOptionTextActive: {
  color: "#10B981",
},
statusOptionTextActiveInactive: {
  color: "#EF4444",
},
statusDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},
submitBtn: {
  borderRadius: 12,
  overflow: "hidden",
  marginTop: 20,
  marginBottom: 10,
},
submitBtnDisabled: {
  opacity: 0.6,
},
submitGradient: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  paddingVertical: 14,
},
submitBtnText: {
  color: "#FFF",
  fontSize: 16,
  fontWeight: "600",
  fontFamily: "Inter_600SemiBold",
},
  profileField: { marginBottom: 16 },
  profileLabel: { fontSize: 14, marginBottom: 8 },
  profileInput: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
  profileModalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  profileCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  profileSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  profileBtnText: { fontSize: 16, fontWeight: '600' },
});

// ==================== MAIN EXPORT ====================
// In OverviewScreen (parent)
// ==================== MAIN EXPORT ====================
// ==================== MAIN EXPORT ====================
export default function OverviewScreen() {
  const { activeBook, setActiveBook } = useApp();
  const [selectedTab, setSelectedTab] = useState<"personal" | "business">("personal");
  const [renderKey, setRenderKey] = useState(0);
  const [showBookDashboard, setShowBookDashboard] = useState(false);

  // Only show BookDashboard when explicitly opened by user
  const handleOpenBook = (book: CashBook) => {
    setActiveBook(book);
    setShowBookDashboard(true);
  };

  const handleCloseBook = () => {
    setActiveBook(null);
    setShowBookDashboard(false);
    // Clear the stored active book
    AsyncStorage.removeItem('lastActiveBookId');
  };

  const handleTabChange = (tab: "personal" | "business") => {
    setSelectedTab(tab);
    AsyncStorage.setItem("selected_tab", tab);
    AsyncStorage.setItem("current_view_mode", tab);
    setRenderKey(prev => prev + 1);
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
    }
  };

  // Only show BookDashboard if user explicitly opened it
  if (showBookDashboard && activeBook) {
    return <BookDashboard onClose={handleCloseBook} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <BooksListView 
        key={renderKey}
        selectedTab={selectedTab} 
        onTabChange={handleTabChange}
        onOpenBook={handleOpenBook}
      />
    </View>
  );
}