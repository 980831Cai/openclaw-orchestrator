import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { getCliStatus, getCliUsage, refreshCliUsage, type CliUsageEntry } from "../api";
import type { Task, CliStatusMap } from "../types";

interface UseCliUsageResult {
  cliStatus: CliStatusMap | null;
  cliUsage: Record<string, CliUsageEntry> | null;
  cliUsageRef: MutableRefObject<Record<string, CliUsageEntry> | null>;
  refreshing: boolean;
  handleRefreshUsage: () => void;
}

export function useCliUsage(tasks: Task[]): UseCliUsageResult {
  const [cliStatus, setCliStatus] = useState<CliStatusMap | null>(null);
  const [cliUsage, setCliUsage] = useState<Record<string, CliUsageEntry> | null>(null);
  const cliUsageRef = useRef<Record<string, CliUsageEntry> | null>(null);
  cliUsageRef.current = cliUsage;

  const [refreshing, setRefreshing] = useState(false);
  const doneCountRef = useRef(0);

  useEffect(() => {
    getCliStatus()
      .then(setCliStatus)
      .catch(() => {});
    getCliUsage()
      .then((response) => {
        if (response.ok) setCliUsage(response.usage);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const doneCount = tasks.filter((task) => task.status === "done").length;
    if (doneCountRef.current > 0 && doneCount > doneCountRef.current) {
      refreshCliUsage()
        .then((response) => {
          if (response.ok) setCliUsage(response.usage);
        })
        .catch(() => {});
    }
    doneCountRef.current = doneCount;
  }, [tasks]);

  const handleRefreshUsage = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    refreshCliUsage()
      .then((response) => {
        if (response.ok) setCliUsage(response.usage);
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [refreshing]);

  return {
    cliStatus,
    cliUsage,
    cliUsageRef,
    refreshing,
    handleRefreshUsage,
  };
}
