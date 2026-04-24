/**
 * DocAdapter interface and adapter-specific types
 *
 * Defines the contract that all source document adapters must implement.
 */

import type {
  AdapterDetectResult,
  ClassificationResult,
  FileInventory,
  SourceType,
} from '../types.js'

/**
 * DocAdapter interface - Implemented by all source document adapters
 *
 * Each adapter is responsible for:
 * 1. Detecting if a source directory matches its expected structure
 * 2. Scanning the source directory for relevant files
 * 3. Classifying scanned files into target categories
 */
export interface DocAdapter {
  /** The source type this adapter handles */
  name: SourceType

  /**
   * Detect if the source directory matches this adapter's expected structure
   * @param sourceDir - Absolute path to the source directory
   * @returns Detection result with confidence score
   */
  detect(sourceDir: string): Promise<AdapterDetectResult>

  /**
   * Scan the source directory for files relevant to this adapter
   * @param sourceDir - Absolute path to the source directory
   * @returns Array of file inventory items with adapter-specific metadata
   */
  scan(sourceDir: string): Promise<FileInventory[]>

  /**
   * Classify scanned files into target categories
   * @param inventory - Array of file inventory items from scan stage
   * @returns Array of classification results with confidence scores
   */
  classify(inventory: FileInventory[]): Promise<ClassificationResult[]>
}
