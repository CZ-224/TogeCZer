import Foundation

/// Canonical mood keys stored in Firestore (aligned with the previous web MVP).
enum MoodOption: String, CaseIterable, Identifiable {
    case OVERTHINKING
    case HAPPY
    case SAD
    case ANGRY
    case TIRED
    case ANXIOUS
    case SICK
    case MISSING
    case RESTING

    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .OVERTHINKING: return "🌩️"
        case .HAPPY: return "😊"
        case .SAD: return "😔"
        case .ANGRY: return "😡"
        case .TIRED: return "😴"
        case .ANXIOUS: return "😰"
        case .SICK: return "🤒"
        case .MISSING: return "🥺"
        case .RESTING: return "😴"
        }
    }

    var label: String {
        switch self {
        case .OVERTHINKING: return "Overthinking"
        case .HAPPY: return "Happy"
        case .SAD: return "Sad"
        case .ANGRY: return "Angry"
        case .TIRED: return "Tired"
        case .ANXIOUS: return "Anxious"
        case .SICK: return "Sick"
        case .MISSING: return "Missing"
        case .RESTING: return "Resting"
        }
    }
}
