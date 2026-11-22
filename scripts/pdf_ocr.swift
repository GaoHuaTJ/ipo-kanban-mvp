import Foundation
import PDFKit
import Vision
import AppKit

guard CommandLine.arguments.count >= 2 else {
    fputs("Usage: pdf_ocr <pdf_path> [max_pages]\n", stderr)
    exit(2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let maxPagesArg = CommandLine.arguments.count >= 3 ? (Int(CommandLine.arguments[2]) ?? 3) : 3
guard let doc = PDFDocument(url: url) else {
    fputs("Failed to open PDF\n", stderr)
    exit(1)
}

let pageLimit = min(doc.pageCount, maxPagesArg)
var allLines: [String] = []

for i in 0..<pageLimit {
    guard let page = doc.page(at: i) else { continue }
    let rect = page.bounds(for: .mediaBox)
    guard rect.width > 0 && rect.height > 0 else { continue }

    let scale: CGFloat = 2.0
    let size = NSSize(width: rect.width * scale, height: rect.height * scale)
    let img = NSImage(size: size)
    img.lockFocus()
    if let ctx = NSGraphicsContext.current?.cgContext {
        ctx.setFillColor(NSColor.white.cgColor)
        ctx.fill(CGRect(origin: .zero, size: size))
        ctx.scaleBy(x: scale, y: scale)
        page.draw(with: .mediaBox, to: ctx)
    }
    img.unlockFocus()

    guard let cgImg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLanguages = ["zh-Hans", "en-US"]
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])
    try? handler.perform([req])

    let observations = (req.results ?? []).compactMap { obs -> (y: CGFloat, x: CGFloat, text: String)? in
        guard let str = obs.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines),
              !str.isEmpty else { return nil }
        return (obs.boundingBox.midY, obs.boundingBox.minX, str)
    }

    // 按纵坐标从上到下（y 降序）排序，并在同一行容差内按横坐标从左到右排列
    let sorted = observations.sorted { a, b in
        if abs(a.y - b.y) > 0.012 {
            return a.y > b.y
        }
        return a.x < b.x
    }

    var buckets: [[(y: CGFloat, x: CGFloat, text: String)]] = []
    for item in sorted {
        if let lastIdx = buckets.indices.last,
           let first = buckets[lastIdx].first,
           abs(first.y - item.y) <= 0.012 {
            buckets[lastIdx].append(item)
        } else {
            buckets.append([item])
        }
    }

    for bucket in buckets {
        let line = bucket.sorted { $0.x < $1.x }.map { $0.text }.joined(separator: " ")
        allLines.append(line)
    }
}

print(allLines.joined(separator: "\n"))
