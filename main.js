// element-plugin-example/main.js

(function () {
    const PLUGIN_TAG = "[element-plugin-example]";

    function waitForClient() {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                const peg = window.mxMatrixClientPeg;
                const client = peg && typeof peg.get === "function" ? peg.get() : null;
                if (client) {
                    clearInterval(interval);
                    console.log(PLUGIN_TAG, "Matrix client detected");
                    resolve(client);
                }
            }, 500);
        });
    }

    function getRoomTopic(room) {
        const state = room.currentState;
        if (!state || typeof state.getStateEvents !== "function") return null;

        const ev = state.getStateEvents("m.room.topic", "");
        if (!ev) return null;

        const event = Array.isArray(ev) ? ev[0] : ev;
        const content = (typeof event.getContent === "function" ? event.getContent() : event.content) || {};
        return typeof content.topic === "string" ? content.topic : null;
    }

    function getMatesSortOrder(room) {
        const state = room.currentState;
        if (!state || typeof state.getStateEvents !== "function") return null;

        const ev = state.getStateEvents("dev.mates.sort_order", "");
        if (!ev) return null;

        const event = Array.isArray(ev) ? ev[0] : ev;
        if (!event) return null;

        const content = (typeof event.getContent === "function" ? event.getContent() : event.content) || {};
        console.log(PLUGIN_TAG, "dev.mates.sort_order content", content);
        return content;
    }

    function getMediaMatesGroupId(room) {
        const state = room.currentState;
        if (!state || typeof state.getStateEvents !== "function") return null;

        const ev = state.getStateEvents("media.mates.groupid", "");
        if (!ev) return null;

        const event = Array.isArray(ev) ? ev[0] : ev;
        if (!event) return null;

        const content = (typeof event.getContent === "function" ? event.getContent() : event.content) || {};
        console.log(PLUGIN_TAG, "media.mates.groupid content", content);
        return content;
    }

    function getMediaMatesGroups(room) {
        const state = room.currentState;
        if (!state || typeof state.getStateEvents !== "function") return null;

        const ev = state.getStateEvents("media.mates.groups", "");
        if (!ev) return null;

        const event = Array.isArray(ev) ? ev[0] : ev;
        if (!event) return null;

        const content = (typeof event.getContent === "function" ? event.getContent() : event.content) || {};
        console.log(PLUGIN_TAG, "media.mates.groups content", content);
        return content;
    }

    function logAllRoomState(room) {
        const state = room.currentState;
        if (!state) {
            console.log(PLUGIN_TAG, "No currentState for room", room.roomId);
            return;
        }

        // Dump the raw RoomState so you can inspect whatever
        // structure matrix-js-sdk is using in this build.
        console.log(PLUGIN_TAG, "Room currentState keys", Object.keys(state));
        console.log(PLUGIN_TAG, "Room currentState raw", state);
    }

    /**
     * Extract the current roomId from the URL hash (#/room/<roomId>).
     * @returns {string | null}
     */
    function getCurrentRoomIdFromLocation() {
        const hash = window.location.hash || "";
        // Common patterns:
        //   #/room/!abc:server
        //   #/room/%21abc%3Aserver
        const match = hash.match(/#\/room\/([^/?]+)/);
        if (!match) return null;

        try {
            return decodeURIComponent(match[1]);
        } catch {
            return match[1];
        }
    }

    function getCurrentRoom(client) {
        const roomId = getCurrentRoomIdFromLocation();
        if (!roomId) return null;
        return client.getRoom(roomId) || null;
    }

    function isSpaceRoomCheck(room) {
        const state = room.currentState;
        if (!state || typeof state.getStateEvents !== "function") return false;
        const ev = state.getStateEvents("m.room.create", "");
        const event = Array.isArray(ev) ? ev[0] : ev;
        if (!event) return false;
        const content = (typeof event.getContent === "function" ? event.getContent() : event.content) || {};
        return content.type === "m.space";
    }

    function setupSortOrderEditor(client) {
        const EDITOR_ID = "mates-sort-order-editor";

        /**
         * Get parent spaces of a room
         */
        function getParentSpaces(room) {
            const parents = [];
            const state = room.currentState;
            if (!state) return parents;

            const allEvents = state.getStateEvents("m.space.parent") || [];
            const events = Array.isArray(allEvents) ? allEvents : [allEvents];

            for (const ev of events) {
                if (!ev) continue;
                const stateKey = typeof ev.getStateKey === "function" ? ev.getStateKey() : ev.state_key;
                if (!stateKey) continue;

                const content = (typeof ev.getContent === "function" ? ev.getContent() : ev.content) || {};
                if (content.via && Array.isArray(content.via) && content.via.length > 0) {
                    const parentRoom = client.getRoom(stateKey);
                    if (parentRoom) {
                        parents.push(parentRoom);
                    }
                }
            }

            return parents;
        }

        /**
         * Get all available groups from parent spaces
         */
        function getAvailableGroups(room) {
            const groups = {};
            const parents = getParentSpaces(room);

            for (const parent of parents) {
                const parentGroups = getMediaMatesGroups(parent) || {};
                if (parentGroups && typeof parentGroups === "object") {
                    for (const [id, value] of Object.entries(parentGroups)) {
                        if (!groups[id]) {
                            groups[id] = {
                                id,
                                name: (value && typeof value.name === "string") ? value.name : id,
                                spaceName: parent.name || "Unknown space",
                            };
                        }
                    }
                }
            }

            return Object.values(groups);
        }

                function createEditor(container) {
                        if (!container || document.getElementById(EDITOR_ID)) return;

                        const isSpace = !!container.closest(".mx_SpaceSettingsDialog");
                        
                        // For space settings, get the space room from the dialog title, not URL
                        let room = null;
                        if (isSpace) {
                            const dialogTitle = document.querySelector(".mx_SpaceSettingsDialog .mx_Dialog_title");
                            const spaceName = dialogTitle ? (dialogTitle.textContent || "").replace(/^Settings - /, "").trim() : "";
                            if (spaceName) {
                                const allRooms = client.getRooms ? client.getRooms() : [];
                                room = allRooms.find((r) => r && r.name === spaceName && isSpaceRoomCheck(r)) || null;
                            }
                            console.log(PLUGIN_TAG, "[editor] Space settings for:", spaceName, room ? room.roomId : "NOT FOUND");
                        }
                        if (!room) {
                            room = getCurrentRoom(client);
                        }
                        if (!room) return;

                        // Get available groups for autocomplete (only for non-space rooms)
                        const availableGroups = !isSpace ? getAvailableGroups(room) : [];

                        const mates = getMatesSortOrder(room) || {};
                        const initialSortOrder =
                typeof mates.order === "string"
                    ? mates.order
                    : typeof mates.value === "string"
                      ? mates.value
                      : "";

                        const groupContent = getMediaMatesGroupId(room) || {};
                        const initialGroupId =
                                typeof groupContent.groupid === "string"
                                        ? groupContent.groupid
                                        : typeof groupContent.group_id === "string"
                                            ? groupContent.group_id
                                            : typeof groupContent.value === "string"
                                                ? groupContent.value
                                                : typeof groupContent.id === "string"
                                                    ? groupContent.id
                                                    : "";

                        const groupsContentRaw = isSpace ? getMediaMatesGroups(room) || {} : {};
                        const groupsContent =
                                groupsContentRaw && typeof groupsContentRaw === "object" ? groupsContentRaw : {};

            const wrapper = document.createElement("div");
            wrapper.id = EDITOR_ID;
            wrapper.style.marginTop = "12px";
            wrapper.style.padding = "8px 0";
            wrapper.style.borderTop = "1px solid rgba(128,128,128,0.3)";

            const label = document.createElement("label");
            label.textContent = "Sort order (dev.mates.sort_order)";
            label.style.display = "block";
            label.style.fontSize = "12px";
            label.style.marginBottom = "4px";

            const orderInput = document.createElement("input");
            orderInput.type = "text";
            orderInput.value = initialSortOrder;
            orderInput.style.width = "100%";
            orderInput.style.boxSizing = "border-box";
            orderInput.style.padding = "4px 6px";
            orderInput.style.marginBottom = "4px";

            const groupLabel = document.createElement("label");
            groupLabel.textContent = "Media group id (media.mates.groupid)";
            groupLabel.style.display = "block";
            groupLabel.style.fontSize = "12px";
            groupLabel.style.margin = "8px 0 4px";

            // Group input with autocomplete
            const groupInputWrapper = document.createElement("div");
            groupInputWrapper.style.position = "relative";

            const groupInput = document.createElement("input");
            groupInput.type = "text";
            groupInput.value = initialGroupId;
            groupInput.style.width = "100%";
            groupInput.style.boxSizing = "border-box";
            groupInput.style.padding = "4px 6px";
            groupInput.style.marginBottom = "4px";

            // Autocomplete dropdown
            const autocompleteList = document.createElement("div");
            autocompleteList.style.cssText = `
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: var(--cpd-color-bg-canvas-default, #1a1a1a);
                border: 1px solid var(--cpd-color-border-interactive-secondary, #444);
                border-radius: 4px;
                max-height: 150px;
                overflow-y: auto;
                z-index: 1000;
                display: none;
            `;

            function updateAutocomplete() {
                const query = groupInput.value.toLowerCase().trim();
                autocompleteList.innerHTML = "";

                if (availableGroups.length === 0) {
                    autocompleteList.style.display = "none";
                    return;
                }

                const filtered = availableGroups.filter(g => 
                    g.id.toLowerCase().includes(query) || 
                    g.name.toLowerCase().includes(query)
                );

                if (filtered.length === 0) {
                    autocompleteList.style.display = "none";
                    return;
                }

                for (const group of filtered) {
                    const item = document.createElement("div");
                    item.style.cssText = `
                        padding: 6px 8px;
                        cursor: pointer;
                        border-bottom: 1px solid var(--cpd-color-border-interactive-secondary, #333);
                    `;
                    item.innerHTML = `
                        <div style="font-weight: 500;">${group.id}</div>
                        <div style="font-size: 11px; opacity: 0.7;">${group.name} • ${group.spaceName}</div>
                    `;
                    item.addEventListener("mouseenter", () => {
                        item.style.background = "var(--cpd-color-bg-subtle-primary, rgba(255,255,255,0.1))";
                    });
                    item.addEventListener("mouseleave", () => {
                        item.style.background = "transparent";
                    });
                    item.addEventListener("mousedown", (e) => {
                        e.preventDefault();
                        groupInput.value = group.id;
                        autocompleteList.style.display = "none";
                    });
                    autocompleteList.appendChild(item);
                }

                autocompleteList.style.display = "block";
            }

            groupInput.addEventListener("focus", updateAutocomplete);
            groupInput.addEventListener("input", updateAutocomplete);
            groupInput.addEventListener("blur", () => {
                // Delay to allow click on autocomplete item
                setTimeout(() => {
                    autocompleteList.style.display = "none";
                }, 150);
            });

            groupInputWrapper.appendChild(groupInput);
            groupInputWrapper.appendChild(autocompleteList);

            const buttonRow = document.createElement("div");
            buttonRow.style.display = "flex";
            buttonRow.style.gap = "8px";

            const saveButton = document.createElement("button");
            saveButton.textContent = "Save media settings";
            saveButton.style.padding = "4px 8px";
            saveButton.style.fontSize = "12px";

            const status = document.createElement("span");
            status.style.fontSize = "11px";
            status.style.opacity = "0.8";

            saveButton.addEventListener("click", () => {
                const roomId = room && room.roomId;
                if (!roomId) {
                    status.textContent = "No active room";
                    return;
                }

                const sortOrderValue = orderInput.value.trim();
                const groupIdValue = groupInput.value.trim();

                const sortOrderContent = { order: sortOrderValue };

                const promises = [];

                promises.push(
                    client
                        .sendStateEvent(roomId, "dev.mates.sort_order", sortOrderContent, ""),
                );

                if (groupIdValue) {
                    const groupIdContent = { groupid: groupIdValue };

                    promises.push(
                        client
                            .sendStateEvent(roomId, "media.mates.groupid", groupIdContent, ""),
                    );

                }

                Promise.all(promises)
                    .then(() => {
                        status.textContent = "Saved";
                        console.log(PLUGIN_TAG, "Updated mates media settings for", roomId, {
                            sortOrderContent,
                            groupId: groupIdValue || null,
                        });
                        // Refresh grouped list if visible
                        if (typeof window.matesRefreshGroupedList === "function") {
                            window.matesRefreshGroupedList();
                        }
                    })
                    .catch((err) => {
                        status.textContent = "Error saving";
                        console.error(PLUGIN_TAG, "Failed to update mates media settings", err);
                    });
            });

            buttonRow.appendChild(saveButton);
            buttonRow.appendChild(status);

            wrapper.appendChild(label);
            wrapper.appendChild(orderInput);
            wrapper.appendChild(groupLabel);
            wrapper.appendChild(groupInputWrapper);
            wrapper.appendChild(buttonRow);

            if (isSpace) {
                const groupsTitle = document.createElement("h3");
                groupsTitle.textContent = "Groups";
                groupsTitle.style.fontSize = "13px";
                groupsTitle.style.margin = "12px 0 4px";

                const groupsList = document.createElement("div");
                groupsList.style.display = "flex";
                groupsList.style.flexDirection = "column";
                groupsList.style.gap = "4px";

                function createGroupRow(id, name) {
                    const row = document.createElement("div");
                    row.className = "mates-groups-row";
                    row.style.display = "flex";
                    row.style.gap = "4px";
                    row.style.alignItems = "center";

                    const idInput = document.createElement("input");
                    idInput.type = "text";
                    idInput.value = id || "";
                    idInput.placeholder = "Group ID";
                    idInput.style.flex = "0 0 140px";
                    idInput.style.padding = "2px 4px";

                    const nameInput = document.createElement("input");
                    nameInput.type = "text";
                    nameInput.value = name || "";
                    nameInput.placeholder = "Name";
                    nameInput.style.flex = "1";
                    nameInput.style.padding = "2px 4px";

                    const controls = document.createElement("div");
                    controls.style.display = "flex";
                    controls.style.gap = "2px";

                    const upButton = document.createElement("button");
                    upButton.textContent = "▲";
                    upButton.style.padding = "2px 4px";
                    upButton.addEventListener("click", () => {
                        const prev = row.previousElementSibling;
                        if (prev) {
                            groupsList.insertBefore(row, prev);
                        }
                    });

                    const downButton = document.createElement("button");
                    downButton.textContent = "▼";
                    downButton.style.padding = "2px 4px";
                    downButton.addEventListener("click", () => {
                        const next = row.nextElementSibling;
                        if (next) {
                            groupsList.insertBefore(next, row);
                        }
                    });

                    const removeButton = document.createElement("button");
                    removeButton.textContent = "✕";
                    removeButton.style.padding = "2px 4px";
                    removeButton.addEventListener("click", () => {
                        row.remove();
                    });

                    controls.appendChild(upButton);
                    controls.appendChild(downButton);
                    controls.appendChild(removeButton);

                    row.appendChild(idInput);
                    row.appendChild(nameInput);
                    row.appendChild(controls);

                    groupsList.appendChild(row);
                }

                const sortedEntries = Object.entries(groupsContent).map(([id, value]) => ({
                    id,
                    name: value && typeof value === "object" && typeof value.name === "string" ? value.name : id,
                    order:
                        value && typeof value === "object" && typeof value.order === "number"
                            ? value.order
                            : 0,
                }));

                sortedEntries
                    .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))
                    .forEach((entry) => createGroupRow(entry.id, entry.name));

                if (!sortedEntries.length) {
                    createGroupRow("", "");
                }

                const groupsActions = document.createElement("div");
                groupsActions.style.display = "flex";
                groupsActions.style.gap = "8px";
                groupsActions.style.marginTop = "4px";

                const addButton = document.createElement("button");
                addButton.textContent = "Add group";
                addButton.style.padding = "4px 8px";
                addButton.style.fontSize = "12px";
                addButton.addEventListener("click", () => {
                    createGroupRow("", "");
                });

                const groupsSaveButton = document.createElement("button");
                groupsSaveButton.textContent = "Save groups";
                groupsSaveButton.style.padding = "4px 8px";
                groupsSaveButton.style.fontSize = "12px";

                const groupsStatus = document.createElement("span");
                groupsStatus.style.fontSize = "11px";
                groupsStatus.style.opacity = "0.8";

                groupsSaveButton.addEventListener("click", () => {
                    const roomId = room && room.roomId;
                    if (!roomId) {
                        groupsStatus.textContent = "No active space";
                        return;
                    }

                    const rows = Array.from(groupsList.querySelectorAll(".mates-groups-row"));
                    const content = {};

                    rows.forEach((row, index) => {
                        const inputs = row.querySelectorAll("input");
                        const idInput = inputs[0];
                        const nameInput = inputs[1];
                        if (!idInput || !nameInput) return;

                        const id = idInput.value.trim();
                        if (!id) return;

                        const name = nameInput.value.trim() || id;
                        content[id] = {
                            name,
                            order: index,
                        };
                    });

                    client
                        .sendStateEvent(roomId, "media.mates.groups", content, "")
                        .then(() => {
                            groupsStatus.textContent = "Saved groups";
                            console.log(PLUGIN_TAG, "Updated media.mates.groups for", roomId, content);
                            // Refresh grouped list if visible
                            if (typeof window.matesRefreshGroupedList === "function") {
                                window.matesRefreshGroupedList();
                            }
                        })
                        .catch((err) => {
                            groupsStatus.textContent = "Error saving groups";
                            console.error(PLUGIN_TAG, "Failed to update media.mates.groups", err);
                        });
                });

                groupsActions.appendChild(addButton);
                groupsActions.appendChild(groupsSaveButton);
                groupsActions.appendChild(groupsStatus);

                wrapper.appendChild(groupsTitle);
                wrapper.appendChild(groupsList);
                wrapper.appendChild(groupsActions);
            }

            container.appendChild(wrapper);
        }

        function findGeneralSectionContainer() {
            // Find the "General" settings section within the Room Settings dialog
            const headings = Array.from(
                document.querySelectorAll(".mx_SettingsSection > h2.mx_Heading_h3"),
            );

            for (const heading of headings) {
                const text = (heading.textContent || "").trim().toLowerCase();
                if (text !== "general") continue;

                const section = heading.parentElement;
                if (!section) continue;

                const subSections = section.querySelector(".mx_SettingsSection_subSections");
                return (subSections || section);
            }

            return null;
        }

        const observer = new MutationObserver(() => {
            const container = findGeneralSectionContainer();
            if (!container) return;
            createEditor(container);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        const initialContainer = findGeneralSectionContainer();
        if (initialContainer) {
            createEditor(initialContainer);
        }
    }

    function computeRoomMetadata(room) {
        const summary = room.getSummary ? room.getSummary() : null;
        const joinedMembers = room.getJoinedMembers ? room.getJoinedMembers() : [];
        const canonicalAlias = room.getCanonicalAlias ? room.getCanonicalAlias() : room.getCanonicalAliasAlt?.();

        return {
            roomId: room.roomId,
            name: room.name,
            topic: getRoomTopic(room),
            mediaGroupId: getMediaMatesGroupId(room),
            mediaGroups: getMediaMatesGroups(room),
            matesSortOrder: getMatesSortOrder(room),
            canonicalAlias: canonicalAlias || null,
            isEncrypted: Boolean(room.currentState && room.currentState.getStateEvents("m.room.encryption", "")),
            joinedMemberCount: joinedMembers.length,
            aliases: summary && Array.isArray(summary.aliases) ? summary.aliases : [],
            creationTs: room.getCreatedAtMillis ? room.getCreatedAtMillis() : null,
        };
    }

    function handleChannelChange(client) {
        const room = getCurrentRoom(client);
        if (!room) {
            console.log(PLUGIN_TAG, "No active room found for current URL");
            return;
        }

        logAllRoomState(room);
        const meta = computeRoomMetadata(room);
        console.log(PLUGIN_TAG, "Active room metadata:", meta);
    }

    /**
     * Sets up Discord-style channel grouping in the space sidebar.
     * 
     * Instead of fighting with Virtuoso's virtualized list, we:
     * 1. Create our own grouped room list that we fully control
     * 2. Hide the original Virtuoso scroller when groups are active
     * 3. Build room tiles ourselves using data from the Matrix client
     */
    function setupSpaceGroupsList(client) {
        const GROUPED_LIST_ID = "mates-grouped-room-list";
        let currentSpaceId = null;

        /**
         * Check if a room is a space by looking at m.room.create type
         */
        function isSpaceRoom(room) {
            const state = room.currentState;
            if (!state || typeof state.getStateEvents !== "function") return false;

            const ev = state.getStateEvents("m.room.create", "");
            const event = Array.isArray(ev) ? ev[0] : ev;
            if (!event) return false;

            const content = (typeof event.getContent === "function" ? event.getContent() : event.content) || {};
            return content.type === "m.space";
        }

        /**
         * Get room's group ID from media.mates.groupid state
         */
        function getRoomGroupId(room) {
            const content = getMediaMatesGroupId(room) || {};
            return content.groupid || content.group_id || content.value || content.id || "";
        }

        /**
         * Get room's sort order from dev.mates.sort_order state
         */
        function getRoomSortOrder(room) {
            const content = getMatesSortOrder(room) || {};
            const val = content.order || content.value || "0";
            const parsed = parseInt(val, 10);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        /**
         * Get child rooms of a space, separating spaces from regular rooms
         */
        function getSpaceChildren(spaceRoom) {
            const children = [];
            const state = spaceRoom.currentState;
            if (!state) return children;

            const allStateEvents = state.getStateEvents("m.space.child") || [];
            const events = Array.isArray(allStateEvents) ? allStateEvents : [allStateEvents];

            for (const ev of events) {
                if (!ev) continue;
                const stateKey = typeof ev.getStateKey === "function" ? ev.getStateKey() : ev.state_key;
                if (!stateKey) continue;

                const content = (typeof ev.getContent === "function" ? ev.getContent() : ev.content) || {};
                if (content.via && Array.isArray(content.via) && content.via.length > 0) {
                    const childRoom = client.getRoom(stateKey);
                    if (childRoom) {
                        children.push(childRoom);
                    }
                }
            }

            return children;
        }

        /**
         * Separate space children into sub-spaces and regular rooms
         */
        function categorizeSpaceChildren(spaceRoom) {
            const children = getSpaceChildren(spaceRoom);
            const subSpaces = [];
            const rooms = [];

            for (const child of children) {
                if (isSpaceRoom(child)) {
                    subSpaces.push(child);
                } else {
                    rooms.push(child);
                }
            }

            // Sort sub-spaces by sort order then name
            subSpaces.sort((a, b) => getRoomSortOrder(a) - getRoomSortOrder(b) || (a.name || "").localeCompare(b.name || ""));
            // Sort rooms by sort order
            rooms.sort((a, b) => getRoomSortOrder(a) - getRoomSortOrder(b));

            return { subSpaces, rooms };
        }

        /**
         * Create a room tile element
         */
        function createRoomTile(room, isSelected) {
            const tile = document.createElement("button");
            tile.type = "button";
            tile.className = "mates-room-tile";
            if (isSelected) tile.classList.add("mates-room-tile-selected");

            tile.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                padding: 8px 12px;
                border: none;
                background: ${isSelected ? "var(--cpd-color-bg-subtle-secondary, rgba(255,255,255,0.1))" : "transparent"};
                color: inherit;
                text-align: left;
                cursor: pointer;
                border-radius: 8px;
                font-size: 14px;
            `;

            // Avatar - get actual room avatar if available
            const avatarContainer = document.createElement("div");
            avatarContainer.style.cssText = `
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: var(--cpd-color-bg-subtle-primary, #3c3c3c);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                flex-shrink: 0;
                overflow: hidden;
            `;

            // Try to get avatar URL from room
            let avatarUrl = null;
            try {
                const avatarMxc = room.getMxcAvatarUrl ? room.getMxcAvatarUrl() : null;
                if (avatarMxc && client.mxcUrlToHttp) {
                    avatarUrl = client.mxcUrlToHttp(avatarMxc, 32, 32, "crop");
                }
            } catch (e) {
                // Fallback to letter
            }

            if (avatarUrl) {
                const avatarImg = document.createElement("img");
                avatarImg.src = avatarUrl;
                avatarImg.alt = "";
                avatarImg.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                `;
                avatarImg.onerror = () => {
                    avatarImg.remove();
                    avatarContainer.textContent = (room.name || "?")[0].toUpperCase();
                };
                avatarContainer.appendChild(avatarImg);
            } else {
                avatarContainer.textContent = (room.name || "?")[0].toUpperCase();
            }

            tile.appendChild(avatarContainer);

            // Room name
            const name = document.createElement("span");
            name.style.cssText = `
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            name.textContent = room.name || room.roomId;
            tile.appendChild(name);

            // Click to navigate
            tile.addEventListener("click", () => {
                window.location.hash = `#/room/${encodeURIComponent(room.roomId)}`;
            });

            // Hover effect
            tile.addEventListener("mouseenter", () => {
                if (!tile.classList.contains("mates-room-tile-selected")) {
                    tile.style.background = "var(--cpd-color-bg-subtle-primary, rgba(255,255,255,0.05))";
                }
            });
            tile.addEventListener("mouseleave", () => {
                if (!tile.classList.contains("mates-room-tile-selected")) {
                    tile.style.background = "transparent";
                }
            });

            return tile;
        }

        /**
         * Create a group header element
         */
        function createGroupHeader(name, isCollapsed, onToggle) {
            const header = document.createElement("div");
            header.className = "mates-group-header";
            header.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 8px 12px 4px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--cpd-color-text-secondary, #888);
                cursor: pointer;
                user-select: none;
            `;

            const arrow = document.createElement("span");
            arrow.style.cssText = `
                font-size: 10px;
                transition: transform 0.2s;
                transform: ${isCollapsed ? "rotate(-90deg)" : "rotate(0deg)"};
            `;
            arrow.textContent = "▼";
            header.appendChild(arrow);

            const label = document.createElement("span");
            label.textContent = name;
            header.appendChild(label);

            header.addEventListener("click", () => {
                onToggle();
            });

            return header;
        }

        /**
         * Create a sub-group header (for nested sub-spaces)
         */
        function createSubGroupHeader(name, isCollapsed, onToggle, depth) {
            const header = document.createElement("div");
            header.className = "mates-subgroup-header";
            header.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 6px 12px 2px;
                padding-left: ${12 + depth * 16}px;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                color: var(--cpd-color-text-secondary, #777);
                cursor: pointer;
                user-select: none;
                opacity: 0.9;
            `;

            const arrow = document.createElement("span");
            arrow.style.cssText = `
                font-size: 8px;
                transition: transform 0.2s;
                transform: ${isCollapsed ? "rotate(-90deg)" : "rotate(0deg)"};
            `;
            arrow.textContent = "▼";
            header.appendChild(arrow);

            const label = document.createElement("span");
            label.textContent = name;
            header.appendChild(label);

            header.addEventListener("click", () => onToggle());

            return header;
        }

        /**
         * Build and render the grouped room list using sub-spaces AND manual groups
         */
        async function renderGroupedList(spaceRoom) {
            const panel = document.querySelector(".mx_RoomListPanel");
            if (!panel) {
                console.log(PLUGIN_TAG, "[groups] No room list panel found");
                return;
            }

            const virtuosoScroller = panel.querySelector('[data-testid="virtuoso-scroller"]');

            // Remove existing grouped list if present
            const existingList = document.getElementById(GROUPED_LIST_ID);
            if (existingList) {
                existingList.remove();
            }

            // Get children categorized
            const { subSpaces, rooms: directRooms } = categorizeSpaceChildren(spaceRoom);

            // Get manual groups from media.mates.groups
            let manualGroups = getMediaMatesGroups(spaceRoom) || {};
            if (!manualGroups || typeof manualGroups !== "object") {
                manualGroups = {};
            }

            console.log(PLUGIN_TAG, "[groups] Space:", spaceRoom.name);
            console.log(PLUGIN_TAG, "[groups] Sub-spaces:", subSpaces.length, subSpaces.map(s => s.name));
            console.log(PLUGIN_TAG, "[groups] Direct rooms:", directRooms.length);
            console.log(PLUGIN_TAG, "[groups] Manual groups:", Object.keys(manualGroups));

            // If nothing to show, use default list
            if (subSpaces.length === 0 && directRooms.length === 0) {
                if (virtuosoScroller) {
                    virtuosoScroller.style.display = "";
                }
                console.log(PLUGIN_TAG, "[groups] No children, showing default list");
                return;
            }

            // Hide virtuoso, show our list
            if (virtuosoScroller) {
                virtuosoScroller.style.display = "none";
            }

            // Get current room for selection highlight
            const currentRoomId = getCurrentRoomIdFromLocation();

            // Collapsed state (persisted in memory for this session)
            const collapsedGroups = new Set();

            // Create container
            const container = document.createElement("div");
            container.id = GROUPED_LIST_ID;
            container.style.cssText = `
                height: 100%;
                overflow-y: auto;
                overflow-x: hidden;
            `;

            // Categorize direct rooms by their manual group
            const roomsByManualGroup = {};
            const ungroupedDirectRooms = [];

            for (const room of directRooms) {
                const groupId = getRoomGroupId(room);
                if (groupId && manualGroups[groupId]) {
                    if (!roomsByManualGroup[groupId]) {
                        roomsByManualGroup[groupId] = [];
                    }
                    roomsByManualGroup[groupId].push(room);
                } else {
                    ungroupedDirectRooms.push(room);
                }
            }

            // Sort rooms within each manual group
            for (const groupId of Object.keys(roomsByManualGroup)) {
                roomsByManualGroup[groupId].sort((a, b) => getRoomSortOrder(a) - getRoomSortOrder(b));
            }
            ungroupedDirectRooms.sort((a, b) => getRoomSortOrder(a) - getRoomSortOrder(b));

            // Build sorted manual groups array
            const sortedManualGroups = Object.entries(manualGroups)
                .map(([id, value]) => ({
                    id,
                    name: (value && typeof value.name === "string") ? value.name : id,
                    order: (value && typeof value.order === "number") ? value.order : 0,
                }))
                .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

            /**
             * Recursively render a sub-space and its children
             */
            function renderSubSpaceContents(subSpace, containerEl, depth) {
                const { subSpaces: nestedSpaces, rooms } = categorizeSpaceChildren(subSpace);
                const groupKey = subSpace.roomId;
                const isCollapsed = collapsedGroups.has(groupKey);

                // Create header based on depth
                const header = depth === 0
                    ? createGroupHeader(subSpace.name || "Unnamed", isCollapsed, () => {
                        if (collapsedGroups.has(groupKey)) {
                            collapsedGroups.delete(groupKey);
                        } else {
                            collapsedGroups.add(groupKey);
                        }
                        render();
                    })
                    : createSubGroupHeader(subSpace.name || "Unnamed", isCollapsed, () => {
                        if (collapsedGroups.has(groupKey)) {
                            collapsedGroups.delete(groupKey);
                        } else {
                            collapsedGroups.add(groupKey);
                        }
                        render();
                    }, depth);

                containerEl.appendChild(header);

                if (!isCollapsed) {
                    // Render rooms in this sub-space
                    for (const room of rooms) {
                        const isSelected = room.roomId === currentRoomId;
                        const tile = createRoomTile(room, isSelected);
                        tile.style.paddingLeft = `${12 + (depth + 1) * 16}px`;
                        containerEl.appendChild(tile);
                    }

                    // Render nested sub-spaces (sub-categories)
                    for (const nestedSpace of nestedSpaces) {
                        renderSubSpaceContents(nestedSpace, containerEl, depth + 1);
                    }
                }
            }

            // Render function (for re-rendering on collapse toggle)
            function render() {
                container.innerHTML = "";

                // 1. Render manual groups for direct rooms first
                for (const group of sortedManualGroups) {
                    const rooms = roomsByManualGroup[group.id] || [];
                    if (rooms.length === 0) continue;

                    const isCollapsed = collapsedGroups.has("manual_" + group.id);
                    const header = createGroupHeader(group.name, isCollapsed, () => {
                        const key = "manual_" + group.id;
                        if (collapsedGroups.has(key)) {
                            collapsedGroups.delete(key);
                        } else {
                            collapsedGroups.add(key);
                        }
                        render();
                    });
                    container.appendChild(header);

                    if (!isCollapsed) {
                        for (const room of rooms) {
                            const isSelected = room.roomId === currentRoomId;
                            const tile = createRoomTile(room, isSelected);
                            container.appendChild(tile);
                        }
                    }
                }

                // 2. Render sub-spaces as groups
                for (const subSpace of subSpaces) {
                    renderSubSpaceContents(subSpace, container, 0);
                }

                // 3. Render ungrouped direct rooms
                if (ungroupedDirectRooms.length > 0) {
                    const hasOtherContent = sortedManualGroups.some(g => (roomsByManualGroup[g.id] || []).length > 0) || subSpaces.length > 0;
                    
                    if (hasOtherContent) {
                        // Show under "Ungrouped" header
                        const isCollapsed = collapsedGroups.has("__ungrouped__");
                        const header = createGroupHeader("Ungrouped", isCollapsed, () => {
                            if (collapsedGroups.has("__ungrouped__")) {
                                collapsedGroups.delete("__ungrouped__");
                            } else {
                                collapsedGroups.add("__ungrouped__");
                            }
                            render();
                        });
                        container.appendChild(header);

                        if (!isCollapsed) {
                            for (const room of ungroupedDirectRooms) {
                                const isSelected = room.roomId === currentRoomId;
                                const tile = createRoomTile(room, isSelected);
                                container.appendChild(tile);
                            }
                        }
                    } else {
                        // No other content, show rooms without header
                        for (const room of ungroupedDirectRooms) {
                            const isSelected = room.roomId === currentRoomId;
                            const tile = createRoomTile(room, isSelected);
                            container.appendChild(tile);
                        }
                    }
                }
            }

            render();

            // Insert after the virtuoso scroller (or at the end of panel)
            if (virtuosoScroller) {
                virtuosoScroller.parentNode.insertBefore(container, virtuosoScroller.nextSibling);
            } else {
                panel.appendChild(container);
            }

            console.log(PLUGIN_TAG, "[groups] Rendered grouped list with", sortedManualGroups.length, "manual groups and", subSpaces.length, "sub-spaces");

            /**
             * Expose a global refresh helper so other editors can request a redraw
             * of the current space's grouped list after changes (e.g., saving groups).
             * @returns {Promise<void>}
             */
            window.matesRefreshGroupedList = async () => {
                try {
                    if (currentSpaceId) {
                        const currentSpace = client.getRoom(currentSpaceId);
                        if (currentSpace) {
                            await renderGroupedList(currentSpace);
                            return;
                        }
                    }
                    await updateGroupedList();
                } catch (e) {
                    console.log(PLUGIN_TAG, "[groups] Refresh error:", e && (e.message || e));
                }
            };
        }

        /**
         * Find current space from header and render grouped list
         */
        async function updateGroupedList() {
            const header = document.querySelector(".mx_RoomListHeaderView_title h1[title]");
            const headerName = header ? (header.getAttribute("title") || header.textContent || "").trim() : "";

            if (!headerName) {
                // No header = not in a space, restore default
                const existingList = document.getElementById(GROUPED_LIST_ID);
                if (existingList) existingList.remove();

                const virtuosoScroller = document.querySelector('.mx_RoomListPanel [data-testid="virtuoso-scroller"]');
                if (virtuosoScroller) virtuosoScroller.style.display = "";
                currentSpaceId = null;
                return;
            }

            const allRooms = client.getRooms ? client.getRooms() : [];
            const spaceRoom = allRooms.find((r) => r && (r.name || "").trim() === headerName && isSpaceRoom(r));

            if (!spaceRoom) {
                console.log(PLUGIN_TAG, "[groups] Could not find space room for:", headerName);
                return;
            }

            // Only re-render if space changed
            if (spaceRoom.roomId === currentSpaceId) {
                return;
            }

            currentSpaceId = spaceRoom.roomId;
            console.log(PLUGIN_TAG, "[groups] Switched to space:", headerName, spaceRoom.roomId);

            await renderGroupedList(spaceRoom);
        }

        // Watch for space changes via header mutations
        function setupHeaderObserver() {
            // Watch the entire header view area for any changes
            const headerView = document.querySelector(".mx_RoomListHeaderView");
            if (!headerView) {
                setTimeout(setupHeaderObserver, 500);
                return;
            }

            let lastHeaderName = "";

            const checkHeader = () => {
                const headerEl = document.querySelector(".mx_RoomListHeaderView_title h1[title]");
                const headerName = headerEl ? (headerEl.getAttribute("title") || headerEl.textContent || "").trim() : "";
                
                if (headerName !== lastHeaderName) {
                    lastHeaderName = headerName;
                    console.log(PLUGIN_TAG, "[groups] Header changed to:", headerName);
                    updateGroupedList();
                }
            };

            const observer = new MutationObserver(() => {
                checkHeader();
            });

            observer.observe(headerView, {
                characterData: true,
                childList: true,
                subtree: true,
                attributes: true,
            });

            // Initial check
            checkHeader();
        }

        /**
         * Listen to relevant Matrix state changes and refresh the grouped list.
         * This catches edits like saving groups, changing room sort order/group id,
         * and adding/removing rooms to spaces.
         */
        function setupClientStateObserver() {
            let refreshTimer = null;
            const triggerRefresh = () => {
                if (refreshTimer) return;
                refreshTimer = setTimeout(async () => {
                    refreshTimer = null;
                    if (typeof window.matesRefreshGroupedList === "function") {
                        await window.matesRefreshGroupedList();
                    }
                }, 150);
            };

            // State changes (fast path)
            if (typeof client.on === "function") {
                client.on("RoomState.events", (event) => {
                    try {
                        const type = (event && typeof event.getType === "function") ? event.getType() : event && event.type;
                        const roomId = (event && typeof event.getRoomId === "function") ? event.getRoomId() : event && (event.room_id || (event.event && event.event.room_id));
                        if (!type) return;
                        if (!currentSpaceId) return;

                        // Refresh when current space's groups or children change
                        if ((type === "media.mates.groups" || type === "m.space.child") && roomId === currentSpaceId) {
                            triggerRefresh();
                            return;
                        }

                        // Also refresh on room-level grouping/sorting changes
                        if (type === "media.mates.groupid" || type === "dev.mates.sort_order") {
                            triggerRefresh();
                        }
                    } catch (e) {
                        // ignore
                    }
                });
            }
        }

        // Watch for room selection changes (hash changes)
        window.addEventListener("hashchange", async () => {
            // Re-render to update selection highlight
            if (currentSpaceId) {
                const spaceRoom = client.getRoom(currentSpaceId);
                if (spaceRoom) {
                    await renderGroupedList(spaceRoom);
                }
            }
        });

        // Initial setup with retry for when DOM is ready
        function init() {
            const panel = document.querySelector(".mx_RoomListPanel");
            if (!panel) {
                setTimeout(init, 500);
                return;
            }

            setupHeaderObserver();
            setupClientStateObserver();
            updateGroupedList();
        }

        init();
    }

    async function start() {
        console.log(PLUGIN_TAG, "Starting plugin…");
        const client = await waitForClient();

        // Initial log for the current room
        handleChannelChange(client);

        // React to navigation / channel changes via hash changes
        window.addEventListener("hashchange", () => handleChannelChange(client));

        setupSortOrderEditor(client);

        setupSpaceGroupsList(client);

        // Optional: also observe timeline or room events if you want
        // client.on("Room.timeline", (event, room) => { ... });
    }

    // Fire and forget
    start().catch((e) => {
        console.error(PLUGIN_TAG, "Failed to start plugin", e);
    });
})();