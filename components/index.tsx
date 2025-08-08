import React, { useEffect, useRef, useState } from 'react';

type SnapPosition = 'left' | 'right' | 'top' | 'bottom' | null;

interface WindowData {
    id: string;
    color: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    snapped: SnapPosition;
    parentId?: string;
    children?: string[];
}

interface GridCell {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    windowId?: string;
    children?: string[];
    parentId?: string;
}

const WINDOW_WIDTH = 300;
const WINDOW_HEIGHT = 200;
const SNAP_THRESHOLD = 30;

function randomColor() {
    return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
}

function randomPosition() {
    const x = Math.floor(Math.random() * (window.innerWidth - WINDOW_WIDTH));
    const y = Math.floor(Math.random() * (window.innerHeight - WINDOW_HEIGHT - 50));
    return { x, y };
}

export default function WindowTiler() {
    const [windows, setWindows] = useState<WindowData[]>([]);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [snapIndicator, setSnapIndicator] = useState<SnapPosition>(null);
    const dragPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [gridCells, setGridCells] = useState<GridCell[]>([
        {
            id: 'root',
            x: 0,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight,
        },
    ]);

    function generateId() {
        return (Math.random() + '').slice(2);
    }

    function findGridCell(x: number, y: number): GridCell | null {
        function findInCell(cell: GridCell): GridCell | null {
            if (
                x >= cell.x &&
                x < cell.x + cell.width &&
                y >= cell.y &&
                y < cell.y + cell.height
            ) {
                // If the cell has children, search them recursively
                if (cell.children && cell.children.length > 0) {
                    for (const childId of cell.children) {
                        const child = gridCells.find(c => c.id === childId);
                        if (child) {
                            const result = findInCell(child);
                            if (result) return result;
                        }
                    }
                }
                return cell;
            }
            return null;
        }

        const root = gridCells.find(c => c.id === 'root');
        return root ? findInCell(root) : null;
    }

    function splitGridCell(cellId: string, snapPosition: SnapPosition, windowId: string): GridCell[] {
        const cell = gridCells.find(c => c.id === cellId);
        if (!cell) return gridCells;

        const newCells: GridCell[] = [];
        const existingWindowId = cell.windowId;

        if (snapPosition === 'left' || snapPosition === 'right') {
            const leftCell: GridCell = {
                id: generateId(),
                x: cell.x,
                y: cell.y,
                width: cell.width / 2,
                height: cell.height,
                windowId: snapPosition === 'left' ? windowId : existingWindowId,
                parentId: cell.id,
            };

            const rightCell: GridCell = {
                id: generateId(),
                x: cell.x + cell.width / 2,
                y: cell.y,
                width: cell.width / 2,
                height: cell.height,
                windowId: snapPosition === 'right' ? windowId : existingWindowId,
                parentId: cell.id,
            };

            newCells.push(leftCell, rightCell);
        } else {
            const topCell: GridCell = {
                id: generateId(),
                x: cell.x,
                y: cell.y,
                width: cell.width,
                height: cell.height / 2,
                windowId: snapPosition === 'top' ? windowId : existingWindowId,
                parentId: cell.id,
            };

            const bottomCell: GridCell = {
                id: generateId(),
                x: cell.x,
                y: cell.y + cell.height / 2,
                width: cell.width,
                height: cell.height / 2,
                windowId: snapPosition === 'bottom' ? windowId : existingWindowId,
                parentId: cell.id,
            };

            newCells.push(topCell, bottomCell);
        }

        const updatedParent: GridCell = {
            ...cell,
            windowId: undefined,
            children: newCells.map(c => c.id),
        };

        return gridCells
            .map(c => (c.id === cellId ? updatedParent : c))
            .concat(newCells);
    }

    function mergeGridCells(cellId: string): GridCell[] {
        const cell = gridCells.find(c => c.id === cellId);
        if (!cell || !cell.parentId) return gridCells;

        const parent = gridCells.find(c => c.id === cell.parentId);
        if (!parent) return gridCells;

        const sibling = gridCells.find(c => c.parentId === cell.parentId && c.id !== cellId);
        if (!sibling) return gridCells;

        const updatedParent = {
            ...parent,
            x: Math.min(parent.x, sibling.x),
            y: Math.min(parent.y, sibling.y),
            width: Math.max(parent.x + parent.width, sibling.x + sibling.width) - Math.min(parent.x, sibling.x),
            height: Math.max(parent.y + parent.height, sibling.y + sibling.height) - Math.min(parent.y, sibling.y),
            windowId: sibling.windowId,
            children: undefined,
        };

        return gridCells
            .filter(c => c.id !== cellId && c.id !== sibling.id)
            .map(c => (c.id === cell.parentId ? updatedParent : c));
    }

    function addWindow() {
        const newWindow: WindowData = {
            id: generateId(),
            color: randomColor(),
            position: randomPosition(),
            size: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
            snapped: null,
        };
        setWindows(ws => [...ws, newWindow]);
    }

    function onDragStart(e: React.MouseEvent, id: string) {
        e.preventDefault();
        const win = windows.find(w => w.id === id);
        if (!win) return;
        setDraggingId(id);
        dragOffset.current = {
            x: e.clientX - win.position.x,
            y: e.clientY - win.position.y,
        };
        dragPos.current = { x: e.clientX, y: e.clientY };
    }

    function onDrag(e: MouseEvent) {
        if (!draggingId) return;
        e.preventDefault();
        const dragWin = windows.find(w => w.id === draggingId);
        const currentCell = gridCells.find(c => c.windowId === draggingId);
        const parentCell = dragWin?.parentId ? gridCells.find(c => c.id === dragWin.parentId) : undefined;

        let newX = e.clientX - dragOffset.current.x;
        let newY = e.clientY - dragOffset.current.y;

        const clampCell = parentCell ?? currentCell;
        if (clampCell) {
            const maxX = clampCell.x + clampCell.width - (dragWin?.size.width ?? WINDOW_WIDTH);
            const maxY = clampCell.y + clampCell.height - (dragWin?.size.height ?? WINDOW_HEIGHT);
            newX = Math.min(Math.max(newX, clampCell.x), Math.max(clampCell.x, maxX));
            newY = Math.min(Math.max(newY, clampCell.y), Math.max(clampCell.y, maxY));
        }

        let indicator: SnapPosition = null;

        dragPos.current = { x: e.clientX, y: e.clientY };

        const allowScreenEdgeSnap = !dragWin?.parentId;

        if (allowScreenEdgeSnap && newX < SNAP_THRESHOLD) indicator = 'left';
        else if (allowScreenEdgeSnap && newX + WINDOW_WIDTH > window.innerWidth - SNAP_THRESHOLD) indicator = 'right';
        else if (allowScreenEdgeSnap && newY < SNAP_THRESHOLD) indicator = 'top';
        else if (allowScreenEdgeSnap && newY + WINDOW_HEIGHT > window.innerHeight - SNAP_THRESHOLD) indicator = 'bottom';
        else {
            const targetCell = findGridCell(e.clientX, e.clientY);
            const cursorInParentBounds = parentCell
                ? e.clientX >= parentCell.x &&
                  e.clientX <= parentCell.x + parentCell.width &&
                  e.clientY >= parentCell.y &&
                  e.clientY <= parentCell.y + parentCell.height
                : true;

            if (targetCell && cursorInParentBounds) {
                const cellX = targetCell.x;
                const cellY = targetCell.y;
                const cellWidth = targetCell.width;
                const cellHeight = targetCell.height;

                const relativeX = e.clientX - cellX;
                const relativeY = e.clientY - cellY;

                const isRootCell = targetCell.id === 'root';

                if (isRootCell) {
                    // Root cell allows snapping on all 4 sides
                    if (relativeX < SNAP_THRESHOLD) indicator = 'left';
                    else if (relativeX > cellWidth - SNAP_THRESHOLD) indicator = 'right';
                    else if (relativeY < SNAP_THRESHOLD) indicator = 'top';
                    else if (relativeY > cellHeight - SNAP_THRESHOLD) indicator = 'bottom';
                } else {
                    const isWider = cellWidth > cellHeight;
                    const isTaller = cellHeight > cellWidth;

                    if (isWider) {
                        if (relativeX < SNAP_THRESHOLD) indicator = 'left';
                        else if (relativeX > cellWidth - SNAP_THRESHOLD) indicator = 'right';
                    } else if (isTaller) {
                        if (relativeY < SNAP_THRESHOLD) indicator = 'top';
                        else if (relativeY > cellHeight - SNAP_THRESHOLD) indicator = 'bottom';
                    } else {
                        if (relativeX < SNAP_THRESHOLD) indicator = 'left';
                        else if (relativeX > cellWidth - SNAP_THRESHOLD) indicator = 'right';
                        else if (relativeY < SNAP_THRESHOLD) indicator = 'top';
                        else if (relativeY > cellHeight - SNAP_THRESHOLD) indicator = 'bottom';
                    }
                }
            }
        }

        setSnapIndicator(indicator);

        setWindows(ws =>
            ws.map(w => {
                if (w.id === draggingId) {
                    return {
                        ...w,
                        position: { x: newX, y: newY },
                        snapped: null,
                    };
                }
                return w;
            })
        );
    }

    function onDragEnd(e: MouseEvent) {
        if (!draggingId) return;
        e.preventDefault();
        const win = windows.find(w => w.id === draggingId);
        if (!win) return;

        if (snapIndicator) {
            const newX = e.clientX - dragOffset.current.x;
            const newY = e.clientY - dragOffset.current.y;
            const isScreenEdgeSnapCandidate =
                newX < SNAP_THRESHOLD ||
                newX + WINDOW_WIDTH > window.innerWidth - SNAP_THRESHOLD ||
                newY < SNAP_THRESHOLD ||
                newY + WINDOW_HEIGHT > window.innerHeight - SNAP_THRESHOLD;

            // Do not allow screen-edge snapping for windows inside a parent cell
            const isScreenEdgeSnap = win.parentId ? false : isScreenEdgeSnapCandidate;

            if (isScreenEdgeSnap) {
                let newPos = { x: newX, y: newY };
                let newSize = { width: WINDOW_WIDTH, height: WINDOW_HEIGHT };

                switch (snapIndicator) {
                    case 'left':
                        newPos = { x: 0, y: 0 };
                        newSize = { width: window.innerWidth / 2, height: window.innerHeight };
                        break;
                    case 'right':
                        newPos = { x: window.innerWidth / 2, y: 0 };
                        newSize = { width: window.innerWidth / 2, height: window.innerHeight };
                        break;
                    case 'top':
                        newPos = { x: 0, y: 0 };
                        newSize = { width: window.innerWidth, height: window.innerHeight / 2 };
                        break;
                    case 'bottom':
                        newPos = { x: 0, y: window.innerHeight / 2 };
                        newSize = { width: window.innerWidth, height: window.innerHeight / 2 };
                        break;
                }

                setWindows(ws =>
                    ws.map(w => {
                        if (w.id === draggingId) {
                            return {
                                ...w,
                                position: newPos,
                                size: newSize,
                                snapped: snapIndicator,
                                parentId: undefined,
                            };
                        }
                        return w;
                    })
                );
            } else {
                const parentCell = win.parentId ? gridCells.find(c => c.id === win.parentId) : undefined;
                const cursorInParentBounds = parentCell
                    ? e.clientX >= parentCell.x &&
                      e.clientX <= parentCell.x + parentCell.width &&
                      e.clientY >= parentCell.y &&
                      e.clientY <= parentCell.y + parentCell.height
                    : true;

                const targetCell = findGridCell(e.clientX, e.clientY);
                if (targetCell && cursorInParentBounds) {
                    const newGridCells = splitGridCell(targetCell.id, snapIndicator, draggingId);
                    setGridCells(newGridCells);

                    const newCell = newGridCells.find(c => c.windowId === draggingId);
                    if (newCell) {
                        setWindows(ws =>
                            ws.map(w => {
                                if (w.id === draggingId) {
                                    return {
                                        ...w,
                                        position: { x: newCell.x, y: newCell.y },
                                        size: { width: newCell.width, height: newCell.height },
                                        snapped: snapIndicator,
                                        parentId: newCell.parentId,
                                    };
                                }
                                return w;
                            })
                        );
                    }
                }
            }
        }
        setDraggingId(null);
        setSnapIndicator(null);
    }

    useEffect(() => {
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', onDragEnd);
        return () => {
            window.removeEventListener('mousemove', onDrag);
            window.removeEventListener('mouseup', onDragEnd);
        };
    }, [draggingId, snapIndicator, windows, gridCells]);

    useEffect(() => {
        function handleResize() {
            setGridCells(cells =>
                cells.map(cell =>
                    cell.id === 'root'
                        ? { ...cell, width: window.innerWidth, height: window.innerHeight }
                        : cell
                )
            );
        }

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    function closeWindow(id: string) {
        const cell = gridCells.find(c => c.windowId === id);
        if (cell) {
            const newGridCells = mergeGridCells(cell.id);
            setGridCells(newGridCells);

            const remainingCell = newGridCells.find(c => c.windowId && c.windowId !== id);
            if (remainingCell) {
                setWindows(ws =>
                    ws.map(w => {
                        if (w.id === remainingCell.windowId) {
                            return {
                                ...w,
                                position: { x: remainingCell.x, y: remainingCell.y },
                                size: { width: remainingCell.width, height: remainingCell.height },
                                snapped: null,
                                parentId: undefined,
                            };
                        }
                        return w;
                    })
                );
            }
        }

        setWindows(ws => ws.filter(w => w.id !== id));
    }

    function moveWindowOut(id: string) {
        const win = windows.find(w => w.id === id);
        if (!win || !win.snapped) return;

        const cell = gridCells.find(c => c.windowId === id);
        if (cell) {
            const newGridCells = mergeGridCells(cell.id);
            setGridCells(newGridCells);

            const remainingCell = newGridCells.find(c => c.windowId && c.windowId !== id);
            if (remainingCell) {
                setWindows(ws =>
                    ws.map(w => {
                        if (w.id === remainingCell.windowId) {
                            return {
                                ...w,
                                position: { x: remainingCell.x, y: remainingCell.y },
                                size: { width: remainingCell.width, height: remainingCell.height },
                                snapped: null,
                                parentId: undefined,
                            };
                        }
                        return w;
                    })
                );
            }
        }

        setWindows(ws =>
            ws.map(w => {
                if (w.id === id) {
                    return {
                        ...w,
                        position: randomPosition(),
                        size: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
                        snapped: null,
                        parentId: undefined,
                    };
                }
                return w;
            })
        );
    }

    return (
        <>
            {windows.map(win => (
                <div
                    key={win.id}
                    style={{
                        position: 'absolute',
                        left: win.position.x,
                        top: win.position.y,
                        width: win.size.width,
                        height: win.size.height,
                        backgroundColor: win.color,
                        boxShadow: '0 0 10px rgba(0,0,0,0.3)',
                        borderRadius: 4,
                        userSelect: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: draggingId === win.id ? 1000 : 1,
                        transition: draggingId ? undefined : 'all 0.2s ease',
                    }}
                >
                    <div
                        onMouseDown={e => onDragStart(e, win.id)}
                        style={{
                            height: 30,
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            cursor: 'grab',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0 8px',
                        }}
                    >
                        <span>Window {win.id}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {win.snapped && (
                                <button
                                    onClick={() => moveWindowOut(win.id)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        lineHeight: 1,
                                    }}
                                    aria-label="Move window out"
                                >
                                    ⬈
                                </button>
                            )}
                            <button
                                onClick={() => closeWindow(win.id)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                    lineHeight: 1,
                                }}
                                aria-label="Close window"
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    <div style={{ flex: 1, padding: 10 }}>
                        <div style={{ fontSize: '12px', color: 'rgba(0,0,0,0.7)' }}>
                            {win.snapped ? `Snapped: ${win.snapped}` : 'Floating window'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'rgba(0,0,0,0.5)', marginTop: '4px' }}>
                            Size: {Math.round(win.size.width)}×{Math.round(win.size.height)}
                        </div>
                        {win.snapped && (
                            <div style={{ fontSize: '10px', color: 'rgba(0,0,0,0.4)', marginTop: '2px' }}>
                                Takes full cell space
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {snapIndicator && (() => {
                const win = windows.find(w => w.id === draggingId);
                const isScreenEdgeSnap = win && (
                    win.position.x < SNAP_THRESHOLD ||
                    win.position.x + WINDOW_WIDTH > window.innerWidth - SNAP_THRESHOLD ||
                    win.position.y < SNAP_THRESHOLD ||
                    win.position.y + WINDOW_HEIGHT > window.innerHeight - SNAP_THRESHOLD
                );

                if (isScreenEdgeSnap) {
                    return (
                        <div
                            style={{
                                position: 'fixed',
                                pointerEvents: 'none',
                                backgroundColor: 'rgba(0, 120, 215, 0.3)',
                                zIndex: 999,
                                border: '2px solid rgba(0, 120, 215, 0.8)',
                                ...(snapIndicator === 'left' && {
                                    top: 0,
                                    left: 0,
                                    bottom: 0,
                                    width: '50vw',
                                }),
                                ...(snapIndicator === 'right' && {
                                    top: 0,
                                    right: 0,
                                    bottom: 0,
                                    width: '50vw',
                                }),
                                ...(snapIndicator === 'top' && {
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: '50vh',
                                }),
                                ...(snapIndicator === 'bottom' && {
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: '50vh',
                                }),
                            }}
                        />
                    );
                } else {
                    const targetCell = findGridCell(dragPos.current.x, dragPos.current.y);
                    if (!targetCell) return null;

                    return (
                        <div
                            style={{
                                position: 'fixed',
                                pointerEvents: 'none',
                                backgroundColor: 'rgba(0, 120, 215, 0.3)',
                                zIndex: 999,
                                border: '2px solid rgba(0, 120, 215, 0.8)',
                                ...(snapIndicator === 'left' && {
                                    top: targetCell.y,
                                    left: targetCell.x,
                                    width: targetCell.width / 2,
                                    height: targetCell.height,
                                }),
                                ...(snapIndicator === 'right' && {
                                    top: targetCell.y,
                                    left: targetCell.x + targetCell.width / 2,
                                    width: targetCell.width / 2,
                                    height: targetCell.height,
                                }),
                                ...(snapIndicator === 'top' && {
                                    top: targetCell.y,
                                    left: targetCell.x,
                                    width: targetCell.width,
                                    height: targetCell.height / 2,
                                }),
                                ...(snapIndicator === 'bottom' && {
                                    top: targetCell.y + targetCell.height / 2,
                                    left: targetCell.x,
                                    width: targetCell.width,
                                    height: targetCell.height / 2,
                                }),
                            }}
                        />
                    );
                }
            })()}

            <button
                onClick={addWindow}
                style={{
                    position: 'fixed',
                    right: 20,
                    bottom: 20,
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    backgroundColor: '#0078d7',
                    color: 'white',
                    fontSize: 30,
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                    userSelect: 'none',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                    zIndex: 1001,
                }}
                aria-label="Add window"
            >
                +
            </button>
        </>
    );
}