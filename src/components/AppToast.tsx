import React, { createContext, useContext, useEffect, useState } from "react";
import { colors, fontWeights, radii, spacing } from '../theme';
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

type ToastType = "success" | "error" | "info";
type Toast = { title: string; message?: string; type: ToastType };
const Context = createContext<((toast: Toast) => void) | null>(null);
let showGlobal: ((toast: Toast) => void) | null = null;

export function showAppToast(
  title: string,
  message?: string,
  type: ToastType = "info",
) {
  showGlobal?.({ title, message, type });
}

export function AppToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    showGlobal = setToast;
    return () => {
      showGlobal = null;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);
  const toastStyle =
    toast?.type === "success"
      ? styles.success
      : toast?.type === "error"
        ? styles.error
        : styles.info;
  return (
    <Context.Provider value={setToast}>
      {children}
      {toast && (
        <View pointerEvents="box-none" style={styles.host}>
          <View style={[styles.toast, toastStyle]}>
            <Ionicons
              name={
                toast.type === "success"
                  ? "checkmark-circle"
                  : toast.type === "error"
                    ? "alert-circle"
                    : "information-circle"
              }
              size={23}
              color={colors.surface}
            />
            <View style={styles.copy}>
              <Text style={styles.title}>{toast.title}</Text>
              {toast.message && (
                <Text style={styles.message}>{toast.message}</Text>
              )}
            </View>
            <Pressable onPress={() => setToast(null)} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.surface} />
            </Pressable>
          </View>
        </View>
      )}
    </Context.Provider>
  );
}

export function useAppToast() {
  const context = useContext(Context);
  if (!context)
    throw new Error("useAppToast deve ser usado dentro de AppToastProvider.");
  return context;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 52,
    zIndex: 1000,
    elevation: 20,
  },
  toast: {
    minHeight: 68,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: colors.brand,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  success: { backgroundColor: colors.success },
  error: { backgroundColor: colors.danger },
  info: { backgroundColor: colors.brand },
  copy: { flex: 1, marginHorizontal: 11 },
  title: { color: colors.surface, fontWeight: fontWeights.extraBold, fontSize: 14 },
  message: {
    color: colors.successSoft,
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
});
