import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { loadGroups, saveGroups } from "@/lib/deviceStorage";
import type { DeviceGroup } from "@/lib/deviceStorage";
import type { VaporizerCommand } from "@/lib/bluetooth";

interface GroupContextValue {
  groups: DeviceGroup[];
  createGroup: (name: string, deviceIds: string[]) => void;
  renameGroup: (groupId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  addToGroup: (groupId: string, deviceId: string) => void;
  removeFromGroup: (groupId: string, deviceId: string) => void;
  sendGroupCommand: (groupId: string, cmd: VaporizerCommand, sendFn: (deviceId: string, cmd: VaporizerCommand) => Promise<void>, deviceIds: string[]) => Promise<void>;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<DeviceGroup[]>(() => loadGroups());

  const updateGroups = useCallback((updated: DeviceGroup[]) => {
    setGroups(updated);
    saveGroups(updated);
  }, []);

  const createGroup = useCallback((name: string, deviceIds: string[]) => {
    const group: DeviceGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      deviceIds,
    };
    updateGroups([...groups, group]);
  }, [groups, updateGroups]);

  const renameGroup = useCallback((groupId: string, name: string) => {
    updateGroups(groups.map(g => g.id === groupId ? { ...g, name } : g));
  }, [groups, updateGroups]);

  const deleteGroup = useCallback((groupId: string) => {
    updateGroups(groups.filter(g => g.id !== groupId));
  }, [groups, updateGroups]);

  const addToGroup = useCallback((groupId: string, deviceId: string) => {
    updateGroups(groups.map(g =>
      g.id === groupId && !g.deviceIds.includes(deviceId)
        ? { ...g, deviceIds: [...g.deviceIds, deviceId] }
        : g
    ));
  }, [groups, updateGroups]);

  const removeFromGroup = useCallback((groupId: string, deviceId: string) => {
    updateGroups(groups.map(g =>
      g.id === groupId
        ? { ...g, deviceIds: g.deviceIds.filter(id => id !== deviceId) }
        : g
    ));
  }, [groups, updateGroups]);

  const sendGroupCommand = useCallback(async (
    groupId: string,
    cmd: VaporizerCommand,
    sendFn: (deviceId: string, cmd: VaporizerCommand) => Promise<void>,
    connectedDeviceIds: string[]
  ) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const targets = group.deviceIds.filter(id => connectedDeviceIds.includes(id));
    await Promise.allSettled(targets.map(id => sendFn(id, cmd)));
  }, [groups]);

  return (
    <GroupContext.Provider value={{
      groups, createGroup, renameGroup, deleteGroup,
      addToGroup, removeFromGroup, sendGroupCommand,
    }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroups() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error("useGroups must be used within GroupProvider");
  return ctx;
}

export type { DeviceGroup };
